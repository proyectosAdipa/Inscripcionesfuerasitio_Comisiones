import { BigQuery } from '@google-cloud/bigquery'

export function createBigQueryClient() {
  const raw = process.env.GOOGLE_APPLICATION_CREDENTIALS_JSON
  if (!raw) throw new Error('GOOGLE_APPLICATION_CREDENTIALS_JSON no configurada')

  const credentials = JSON.parse(raw)

  return new BigQuery({
    projectId: credentials.project_id,
    credentials,
  })
}
