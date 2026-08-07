import { type Response } from 'express'

export function success<T>(res: Response, data: T, status = 200) {
  return res.status(status).json({ success: true, data })
}

export function paginated<T>(res: Response, data: T[], total: number, cursor?: string) {
  return res.status(200).json({ success: true, data, pagination: { total, cursor: cursor ?? null } })
}

export function created<T>(res: Response, data: T) {
  return res.status(201).json({ success: true, data })
}

export function noContent(res: Response) {
  return res.status(204).send()
}
