import { readdirSync, readFileSync } from 'node:fs'
import { join, posix, relative } from 'node:path'
import { describe, expect, it } from 'vitest'

// Règle de dépendance (AGENTS.md §4, docs/architecture.md §8) : architecture par contextes.
// Un fichier de `src/contexts/X/` n'importe jamais `src/contexts/Y/` ; il passe par ses propres `app/interfaces`,
// et seul `platform/` (assemblage) relie les contextes.

type Zone =
    | { kind: 'shared'; layer: 'domain' | 'app' }
    | { kind: 'context'; context: string; layer: 'domain' | 'app' | 'api' | 'infra' }
    | { kind: 'platform'; area: string }
    | { kind: 'generated' }
    | { kind: 'root' } // main.ts : composition
    | { kind: 'config' } // config/ : lecture de l'environnement, sans import interne

const CONTEXT_LAYERS = ['domain', 'app', 'api', 'infra'] as const

/** Zone d'un chemin relatif à `src/` (séparateurs `/`). */
export function zoneOf(path: string): Zone {
    const [first, second, third] = path.split('/')
    if (first === 'shared' && (second === 'domain' || second === 'app')) return { kind: 'shared', layer: second }
    if (first === 'contexts' && second && CONTEXT_LAYERS.includes(third as (typeof CONTEXT_LAYERS)[number])) {
        return { kind: 'context', context: second, layer: third as (typeof CONTEXT_LAYERS)[number] }
    }
    if (first === 'platform') return { kind: 'platform', area: second ?? '' }
    if (first === 'generated') return { kind: 'generated' }
    if (first === 'main.ts') return { kind: 'root' }
    if (first === 'config') return { kind: 'config' }
    throw new Error(`Fichier hors de l'architecture : src/${path}`)
}

/** Paquets npm (et modules `node:`) autorisés par couche ; `true` = tous. */
function packageAllowed(from: Zone, specifier: string): boolean {
    if (from.kind === 'platform' || from.kind === 'root' || from.kind === 'generated' || from.kind === 'config') {
        return true
    }
    if (from.kind === 'context' && from.layer === 'infra') return true
    if (from.kind === 'context' && from.layer === 'api') return specifier === 'express' || specifier === 'zod'
    return false // shared, domain et app : aucun paquet, ni framework ni module Node
}

/** Fichiers internes autorisés ; `fromFile` sert aux exceptions de la couche api. */
function internalAllowed(from: Zone, fromFile: string, to: Zone, toFile: string): boolean {
    if (from.kind === 'platform' || from.kind === 'root') return true
    if (from.kind === 'generated') return to.kind === 'generated'
    if (from.kind === 'config') return false

    if (from.kind === 'shared') {
        return to.kind === 'shared' && (from.layer === 'app' || to.layer === 'domain')
    }

    // Contextes : jamais un autre contexte.
    if (to.kind === 'context' && to.context !== from.context) return false
    const sameContext = to.kind === 'context'
    switch (from.layer) {
        case 'domain':
            return (sameContext && to.layer === 'domain') || (to.kind === 'shared' && to.layer === 'domain')
        case 'app':
            return (sameContext && (to.layer === 'domain' || to.layer === 'app')) || to.kind === 'shared'
        case 'api':
            // Routes et présentateurs ne voient que les cas d'usage et leurs sorties : jamais un repository, un service
            // ou un utilitaire qui manipule des entités. Du domaine, seules les erreurs et, dans les schémas, les
            // constantes de validation.
            if (sameContext && to.layer === 'domain') return toFile.endsWith('-errors.ts') || fromFile.endsWith('.schemas.ts')
            if (sameContext && to.layer === 'app') {
                return /\/app\/use-cases\//.test(toFile) || /\/app\/utils\/[^/]+-output\.ts$/.test(toFile)
            }
            return (
                (sameContext && to.layer === 'api') ||
                to.kind === 'shared' ||
                (to.kind === 'platform' && to.area === 'http')
            )
        case 'infra':
            return (
                (sameContext && to.layer !== 'api') ||
                to.kind === 'shared' ||
                to.kind === 'generated' ||
                (to.kind === 'platform' && to.area === 'prisma')
            )
    }
}

/**
 * `import … from`, `export … from`, `import 'x'`, `import('x')` et `require('x')`, avec une chaîne littérale.
 * Limite assumée : un chemin calculé (`import(variable)`, `createRequire`) n'est pas vu ; le projet est en ESM,
 * sans alias `paths`, et la revue de code reste le complément de ce test.
 */
const IMPORT_SPECIFIER = /(?:\bfrom\s*|\bimport\s*\(?\s*|\brequire\s*\(\s*)['"]([^'"]+)['"]/g

/** Violations d'un fichier `file` (chemin relatif à `src/`, séparateurs `/`). */
export function findViolations(file: string, source: string): string[] {
    const from = zoneOf(file)
    return [...source.matchAll(IMPORT_SPECIFIER)]
        .map((match) => match[1] ?? '')
        .filter((specifier) => {
            if (!specifier.startsWith('.')) return !packageAllowed(from, specifier)
            const target = `${posix.normalize(posix.join(posix.dirname(file), specifier))}.ts`
            if (target.startsWith('..')) return true // hors de src/
            return !internalAllowed(from, file, zoneOf(target), target)
        })
        .map((specifier) => `${file} → ${specifier}`)
}

function listSourceFiles(): string[] {
    return readdirSync('src', { withFileTypes: true, recursive: true })
        .filter((entry) => entry.isFile() && entry.name.endsWith('.ts'))
        .map((entry) => relative('src', join(entry.parentPath, entry.name)).replaceAll('\\', '/'))
        .filter((file) => !file.startsWith('generated/'))
}

describe("règle de dépendance de l'architecture par contextes", () => {
    it("aucun fichier de src/ n'enfreint la règle", () => {
        const files = listSourceFiles()
        expect(files.length).toBeGreaterThan(50)

        const violations = files.flatMap((file) => findViolations(file, readFileSync(join('src', file), 'utf8')))
        expect(violations).toEqual([])
    })

    it('chaque fichier appartient à une zone connue (shared, contexts/X/couche, platform, main, config)', () => {
        expect(() => listSourceFiles().map(zoneOf)).not.toThrow()
    })

    it('domaine : refuse frameworks, modules Node, couche app et autre contexte (cas volontairement fautif)', () => {
        const source = [
            "import express from 'express'",
            "import { randomUUID } from 'node:crypto'",
            "import type { CombatRepository } from '../app/interfaces/combat-repository'",
            "import { Character } from '../../characters/domain/character'",
            "import { DomainError } from '../../../shared/domain/domain-error'",
            "import { computeDamage } from './damage'"
        ].join('\n')

        expect(findViolations('contexts/combat/domain/faux.ts', source)).toEqual([
            'contexts/combat/domain/faux.ts → express',
            'contexts/combat/domain/faux.ts → node:crypto',
            'contexts/combat/domain/faux.ts → ../app/interfaces/combat-repository',
            'contexts/combat/domain/faux.ts → ../../characters/domain/character'
        ])
    })

    it('app : refuse Prisma, platform et un autre contexte ; accepte domaine, interfaces et shared', () => {
        const source = [
            "import type { PrismaClient } from '../../../../generated/prisma/client'",
            "import { createPrismaUnitOfWork } from '../../../../platform/prisma/prisma-unit-of-work'",
            "import type { CharacterRepository } from '../../../characters/app/interfaces/character-repository'",
            "import { z } from 'zod'",
            "import type { UnitOfWork } from '../../../../shared/app/unit-of-work'",
            "import { Combat } from '../../domain/combat'",
            "import type { CombatFighters } from '../interfaces/combat-fighters'"
        ].join('\n')

        expect(findViolations('contexts/combat/app/use-cases/faux.ts', source)).toEqual([
            'contexts/combat/app/use-cases/faux.ts → ../../../../generated/prisma/client',
            'contexts/combat/app/use-cases/faux.ts → ../../../../platform/prisma/prisma-unit-of-work',
            'contexts/combat/app/use-cases/faux.ts → ../../../characters/app/interfaces/character-repository',
            'contexts/combat/app/use-cases/faux.ts → zod'
        ])
    })

    it('api : un présentateur ne voit pas les entités ; les schémas peuvent lire les constantes du domaine', () => {
        const presenter = [
            "import type { Combat } from '../domain/combat'",
            "import { combatErrors } from '../domain/combat-errors'",
            "import { createPrismaClient } from '../../../platform/prisma/client'",
            "import argon2 from 'argon2'",
            "import type { CombatView } from '../app/utils/combat-output'",
            "import { success } from '../../../platform/http/http-response'"
        ].join('\n')
        const schemas = "import { EMAIL_MAX_LENGTH } from '../domain/email'"
        const controller = [
            "import type { CombatRepository } from '../app/interfaces/combat-repository'",
            "import { ensureCombatOwnedBy } from '../app/utils/find-owned-combat'",
            "const legacy = require('../../characters/domain/character')",
            "import type { StartCombat } from '../app/use-cases/start-combat'"
        ].join('\n')

        expect(findViolations('contexts/combat/api/faux.presenter.ts', presenter)).toEqual([
            'contexts/combat/api/faux.presenter.ts → ../domain/combat',
            'contexts/combat/api/faux.presenter.ts → ../../../platform/prisma/client',
            'contexts/combat/api/faux.presenter.ts → argon2'
        ])
        expect(findViolations('contexts/identity/api/faux.schemas.ts', schemas)).toEqual([])
        expect(findViolations('contexts/combat/api/faux.routes.ts', controller)).toEqual([
            'contexts/combat/api/faux.routes.ts → ../app/interfaces/combat-repository',
            'contexts/combat/api/faux.routes.ts → ../app/utils/find-owned-combat',
            'contexts/combat/api/faux.routes.ts → ../../characters/domain/character'
        ])
    })

    it("config : lit l'environnement, sans aucun import interne", () => {
        const source = ["import { z } from 'zod'", "import { MAX_LEVEL } from '../shared/domain/game-rules'"].join('\n')

        expect(findViolations('config/faux.ts', source)).toEqual(['config/faux.ts → ../shared/domain/game-rules'])
    })

    it('infra et shared : jamais un autre contexte ni la couche api ; shared ne dépend de rien', () => {
        const infra = [
            "import type { WorldRepository } from '../../world/app/interfaces/world-repository'",
            "import { presentCombat } from '../api/combat.presenter'",
            "import type { Prisma } from '../../../generated/prisma/client'",
            "import { isUniqueViolation } from '../../../platform/prisma/prisma-errors'"
        ].join('\n')
        const shared = [
            "import type { Clock } from '../app/clock'",
            "import type { Fighter } from '../../contexts/combat/app/interfaces/combat-fighters'"
        ].join('\n')

        expect(findViolations('contexts/combat/infra/faux.ts', infra)).toEqual([
            'contexts/combat/infra/faux.ts → ../../world/app/interfaces/world-repository',
            'contexts/combat/infra/faux.ts → ../api/combat.presenter'
        ])
        expect(findViolations('shared/domain/faux.ts', shared)).toEqual([
            'shared/domain/faux.ts → ../app/clock',
            'shared/domain/faux.ts → ../../contexts/combat/app/interfaces/combat-fighters'
        ])
    })
})
