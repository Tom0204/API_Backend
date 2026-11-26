import { Router } from 'express'
import swaggerUi from 'swagger-ui-express'
import { createOpenApiDocument } from './openapi-document'

/**
 * `/docs` (DOC-02, L8 D7) : Swagger UI et `/docs/openapi.json`, publics, hors `/api/v1` et sans limitation.
 * Montées seulement hors production (`AppOptions.apiDocs`).
 */
export function createDocsRoutes(): Router {
    const document = createOpenApiDocument()
    const router = Router()

    router.get('/docs/openapi.json', (_req, res) => {
        res.status(200).json(document)
    })
    // Aucun appel externe : pas de badge de validation (CSP de Helmet), spec intégrée à la page.
    router.use('/docs', swaggerUi.serve, swaggerUi.setup(document, { swaggerOptions: { validatorUrl: null } }))

    return router
}
