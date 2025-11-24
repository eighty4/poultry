import { randomUUID } from 'node:crypto'
import { mkdir, writeFile } from 'node:fs/promises'
import { join } from 'node:path'

// parameterizable opts for GitHub legacy code search
// fulfills search syntax documented at https://docs.github.com/en/search-github/searching-on-github/searching-code
export type SearchURLOpts = {
    qualifiers: {
        extension?: string | Array<string>
        filename?: string | Array<string>
        in?: string | Array<string>
        language?: string | Array<string>
        org?: string | Array<string>
        path?: string | Array<string>
        repo?: string | Array<string>
        size?: string | Array<string>
        user?: string | Array<string>
    }
}

export function makeSearchURL(opts: SearchURLOpts): URL {
    const url = new URL('https://api.github.com/search/code')
    let q = []
    for (const [qk, qv] of Object.entries(opts.qualifiers)) {
        if (Array.isArray(qv)) {
            for (const qvd of qv) {
                q.push(`${qk}:${qvd}`)
            }
        } else {
            q.push(`${qk}:${qv}`)
        }
    }
    url.searchParams.set('q', q.join(' '))
    url.searchParams.set('per_page', '100')
    url.searchParams.set('page', '1')
    return url
}

export type SyncSearchPageOpts = {
    ghToken: string
    outdir: string
    url: URL // | string | SearchURLOpts
    page?: number
}

export type SyncSearchPageResult =
    | {
          kind: 'success'
          pages: {
              remaining: number
              total: number
          }
      }
    | {
          kind: 'error'
          type: 'unauthorized'
      }
    | {
          kind: 'error'
          type: 'rate-limited'
          reset: Date | null
      }

type SyncSearchPageError = SyncSearchPageResult & { kind: 'error' }

function isErrorResult(result: unknown): result is SyncSearchPageError {
    return (
        result !== null &&
        typeof result === 'object' &&
        'kind' in result &&
        result.kind === 'error'
    )
}

export async function syncSearchPage(
    syncOpts: SyncSearchPageOpts,
): Promise<SyncSearchPageResult> {
    if (syncOpts.page) {
        syncOpts.url.searchParams.set('page', '' + syncOpts.page)
    }
    const searchResponse = await codeSearch(syncOpts)
    if (isErrorResult(searchResponse)) {
        return searchResponse
    }
    const contents = await retrieveObjectContents(
        syncOpts.ghToken,
        searchResponse.items,
    )
    if (isErrorResult(contents)) {
        return contents
    }
    await syncToOutdir(syncOpts.outdir, searchResponse.items, contents)
    const pageCount = Math.ceil(searchResponse.total_count / 100)
    return {
        kind: 'success',
        pages: {
            remaining: pageCount - (syncOpts.page || 1),
            total: pageCount,
        },
    }
}

// response from GitHub legacy code search
// all fields documented at https://docs.github.com/en/rest/search/search?apiVersion=2022-11-28#search-code
type CodeSearchResponse = {
    total_count: number
    incomplete_results: boolean
    items: Array<{
        score: number
        name: string
        path: string
        repository: {
            name: string
            fork: boolean
            owner: {
                login: string
            }
        }
    }>
}

async function codeSearch(
    syncOpts: SyncSearchPageOpts,
): Promise<CodeSearchResponse | SyncSearchPageError> {
    const response = await fetch(syncOpts.url.toString(), {
        headers: {
            Authorization: 'Bearer ' + syncOpts.ghToken,
        },
    })
    const maybeError = errorFromGitHubResponse(response)
    if (maybeError) {
        return maybeError
    }
    return await response.json()
}

type QKey = `q${string}`

async function retrieveObjectContents(
    ghToken: string,
    items: CodeSearchResponse['items'],
): Promise<Array<string | null> | SyncSearchPageError> {
    const qKeys: Array<QKey> = []
    const qParts: Array<string> = []
    for (const item of items) {
        const key: QKey = `q${randomUUID().replaceAll('-', '')}`
        qKeys.push(key)
        qParts.push(
            graphQueryForObjectText(
                key,
                item.repository.owner.login,
                item.repository.name,
                item.path,
            ),
        )
    }
    const query = `query {\n${qParts.join('\n')}\n}`
    const response = await fetch('https://api.github.com/graphql', {
        method: 'POST',
        headers: {
            Authorization: 'Bearer ' + ghToken,
        },
        body: JSON.stringify({
            query,
        }),
    })
    const maybeError = errorFromGitHubResponse(response)
    if (maybeError) {
        return maybeError
    }
    const json = await response.json()
    const objectContents: Array<string | null> = []
    for (const key of qKeys) {
        objectContents.push(json.data[key].object?.text || null)
    }
    return objectContents
}

function graphQueryForObjectText(
    key: QKey,
    owner: string,
    repo: string,
    path: string,
): string {
    return `\
${key}: repository(owner: "${owner}", name: "${repo}") {
    object(expression: "HEAD:${path}") {
        ... on Blob {
            text
        }
    }
}`
}

async function syncToOutdir(
    outdir: string,
    items: CodeSearchResponse['items'],
    contents: Array<string | null>,
) {
    await mkdir(outdir, { recursive: true })
    const writes: Array<Promise<any>> = []
    for (let i = 0; i < items.length; i++) {
        const objectContent = contents[i]
        if (!objectContent) continue
        const item = items[i]
        const filename = `${item.repository.owner.login}_${item.repository.name}_${item.path.replaceAll(/\//g, '_')}`
        writes.push(writeFile(join(outdir, filename), objectContent))
    }
    await Promise.all(writes)
}

function errorFromGitHubResponse(
    response: Response,
): SyncSearchPageError | never | undefined {
    if (!response.headers.get('content-type')?.startsWith('application/json')) {
        console.log(
            'search/code',
            response.status,
            response.headers.get('content-type'),
        )
        process.exit(1)
    }
    if (response.status === 401) {
        return {
            kind: 'error',
            type: 'unauthorized',
        }
    }
    if (response.status === 403) {
        const rateLimitReset = response.headers.get('x-ratelimit-reset')
        return {
            kind: 'error',
            type: 'rate-limited',
            reset: rateLimitReset
                ? new Date(parseInt(rateLimitReset, 10) * 1000)
                : null,
        }
    }
}
