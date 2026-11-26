import type { NextFunction, Request, RequestHandler, Response } from 'express'

/** Express 4 n'intercepte pas les promesses rejetées : l'erreur est transmise au middleware d'erreurs. */
export function asyncHandler(handler: (req: Request, res: Response) => Promise<void>): RequestHandler {
    return (req: Request, res: Response, next: NextFunction) => {
        handler(req, res).catch(next)
    }
}
