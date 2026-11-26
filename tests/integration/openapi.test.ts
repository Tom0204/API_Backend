import request from 'supertest'
import { describe, expect, it } from 'vitest'
import { createOpenApiDocument } from '../../src/platform/http/openapi/openapi-document'
import { buildTestApp } from '../fakes/test-app'

/** Forme minimale de la pile interne d'Express 4 (`app._router.stack`), lue uniquement par ce test. */
interface Layer {
    route?: { path: string; methods: Record<string, boolean> }
    handle?: { stack?: Layer[] }
}

function isLayerList(value: unknown): value is Layer[] {
    return Array.isArray(value)
}

/** Routes enregistrées, au format OpenAPI : `GET /api/v1/combats/{combatId}`. Chaque routeur déclare des chemins complets. */
function registeredRoutes(app: unknown): string[] {
    const router: unknown = typeof app === 'function' && '_router' in app ? app._router : undefined
    const stack: unknown = typeof router === 'function' && 'stack' in router ? router.stack : undefined // un routeur est une fonction
    if (!isLayerList(stack)) throw new Error('Pile Express introuvable')

    const routes: string[] = []
    const walk = (layers: Layer[]) => {
        for (const layer of layers) {
            if (layer.route) {
                const path = layer.route.path.replace(/:(\w+)/g, '{$1}')
                for (const method of Object.keys(layer.route.methods)) routes.push(`${method.toUpperCase()} ${path}`)
            } else if (layer.handle?.stack) {
                walk(layer.handle.stack)
            }
        }
    }
    walk(stack)
    return routes
}

function documentedRoutes(): string[] {
    return Object.entries(createOpenApiDocument().paths).flatMap(([path, operations]) =>
        Object.keys(operations).map((method) => `${method.toUpperCase()} ${path}`)
    )
}

describe('documentation OpenAPI (DOC-02)', () => {
    it('chaque route de l’application figure dans la spécification, et inversement', () => {
        const { app } = buildTestApp()

        const registered = registeredRoutes(app)

        expect(registered.length).toBeGreaterThan(20)
        expect(registered.filter((route) => !documentedRoutes().includes(route))).toEqual([])
        expect(documentedRoutes().filter((route) => !registered.includes(route))).toEqual([])
    })

    it('enveloppes et erreurs décrites une seule fois, référencées par chaque opération', () => {
        const document = createOpenApiDocument()
        const serialized = JSON.stringify(document.paths)

        expect(document.openapi).toBe('3.1.0')
        expect(Object.keys(document.components.schemas)).toEqual(expect.arrayContaining(['SuccessEnvelope', 'ErrorEnvelope']))
        expect(serialized).not.toContain('"success"') // jamais redéfinies dans une opération
        expect(serialized).toContain('#/components/schemas/SuccessEnvelope')
        expect(serialized).toContain('#/components/responses/ValidationError')
    })

    it('corps tirés des schémas Zod stricts : champ inconnu refusé', () => {
        const body = createOpenApiDocument().paths['/api/v1/characters'].post.requestBody?.content['application/json'].schema

        expect(body).toMatchObject({ type: 'object', required: ['name', 'classId'], additionalProperties: false })
    })

    it('/docs/openapi.json et /docs répondent sans jeton', async () => {
        const { app } = buildTestApp()

        const json = await request(app).get('/docs/openapi.json')
        const ui = await request(app).get('/docs/')

        expect(json.status).toBe(200)
        expect(json.body).toEqual(JSON.parse(JSON.stringify(createOpenApiDocument())))
        expect(ui.status).toBe(200)
        expect(ui.headers['content-type']).toContain('text/html')
        expect(ui.text).toContain('swagger-ui')
    })

    it('désactivée en production (apiDocs: false) → 404', async () => {
        const { app } = buildTestApp({ apiDocs: false })

        expect((await request(app).get('/docs/openapi.json')).status).toBe(404)
        expect((await request(app).get('/docs/')).status).toBe(404)
    })
})
