import { readdirSync, readFileSync } from 'node:fs'
import { join, relative } from 'node:path'
import { describe, expect, it } from 'vitest'

// Règle de dépendance des couches (AGENTS.md §4, docs/architecture.md §7).
// Les motifs portent sur le chemin importé, qu'il vienne de `import … from`, `export … from` ou `import(…)`.
const FORBIDDEN: Record<string, RegExp[]> = {
    'src/domain': [
        /^express$/,
        /^zod$/,
        /prisma/,
        /^argon2$/,
        /^pino/,
        /(^|\/)application\//,
        /(^|\/)infrastructure\//,
        /(^|\/)interfaces\//
    ],
    'src/application': [/^express$/, /prisma/, /^argon2$/, /^pino/, /(^|\/)infrastructure\//, /(^|\/)interfaces\//],
    // interfaces/http n'utilise que l'application (et des constantes ou erreurs du domaine) : jamais l'infrastructure.
    'src/interfaces/http': [/prisma/, /generated\//, /^argon2$/, /(^|\/)infrastructure\//]
}

const IMPORT_SPECIFIER = /(?:\bfrom\s*|\bimport\s*\(?\s*)['"]([^'"]+)['"]/g

export function findViolations(layer: string, file: string, source: string): string[] {
    const patterns = FORBIDDEN[layer] ?? []
    return [...source.matchAll(IMPORT_SPECIFIER)]
        .map((match) => match[1] ?? '')
        .filter((specifier) => patterns.some((pattern) => pattern.test(specifier)))
        .map((specifier) => `${file} → ${specifier}`)
}

function listTypeScriptFiles(directory: string): string[] {
    return readdirSync(directory, { withFileTypes: true, recursive: true })
        .filter((entry) => entry.isFile() && entry.name.endsWith('.ts'))
        .map((entry) => join(entry.parentPath, entry.name))
}

describe('règle de dépendance des couches', () => {
    for (const layer of Object.keys(FORBIDDEN)) {
        it(`${layer} n'importe aucune dépendance interdite`, () => {
            const files = listTypeScriptFiles(layer)
            expect(files.length).toBeGreaterThan(0)

            const violations = files.flatMap((file) =>
                findViolations(layer, relative('.', file).replaceAll('\\', '/'), readFileSync(file, 'utf8'))
            )
            expect(violations).toEqual([])
        })
    }

    it('détecte un domaine qui importe Express, Zod, Prisma ou une autre couche (cas volontairement fautif)', () => {
        const source = [
            "import express from 'express'",
            'import { z } from "zod"',
            "import { PrismaClient } from '../../generated/prisma/client'",
            "export { createApp } from '../../interfaces/http/app'",
            "const module = await import('../../application/ports/unit-of-work')",
            "import { DomainError } from '../shared/domain-error'"
        ].join('\n')

        expect(findViolations('src/domain', 'faux.ts', source)).toEqual([
            'faux.ts → express',
            'faux.ts → zod',
            'faux.ts → ../../generated/prisma/client',
            'faux.ts → ../../interfaces/http/app',
            'faux.ts → ../../application/ports/unit-of-work'
        ])
    })

    it("détecte une application qui importe Express ou l'infrastructure, mais accepte le domaine", () => {
        const source = [
            "import type { Request } from 'express'",
            "import { createPrismaUnitOfWork } from '../../infrastructure/prisma/prisma-unit-of-work'",
            "import { DomainError } from '../../domain/shared/domain-error'",
            "import { z } from 'zod'"
        ].join('\n')

        expect(findViolations('src/application', 'faux.ts', source)).toEqual([
            'faux.ts → express',
            'faux.ts → ../../infrastructure/prisma/prisma-unit-of-work'
        ])
    })

    it("détecte une interface HTTP qui importe l'infrastructure ou Prisma, mais accepte l'application", () => {
        const source = [
            "import { createPrismaClient } from '../../../infrastructure/prisma/client'",
            "import type { Prisma } from '../../../generated/prisma/client'",
            "import argon2 from 'argon2'",
            "import type { Login } from '../../../application/identity/login'",
            "import express from 'express'"
        ].join('\n')

        expect(findViolations('src/interfaces/http', 'faux.ts', source)).toEqual([
            'faux.ts → ../../../infrastructure/prisma/client',
            'faux.ts → ../../../generated/prisma/client',
            'faux.ts → argon2'
        ])
    })
})
