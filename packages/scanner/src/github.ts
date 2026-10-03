import type { GitHubApi, PullFile, PullRef, Review } from './review'

const API = 'https://api.github.com'
const MAX_COMMENT = 65_000

/** GitHub REST calls the trusted review needs, authenticated with the workflow's token. */
export function githubApi(repo: string, token: string): GitHubApi {
  const headers = (accept = 'application/vnd.github+json') => ({
    Accept: accept,
    Authorization: `Bearer ${token}`,
    'X-GitHub-Api-Version': '2022-11-28',
  })
  async function call(method: string, path: string, body?: unknown): Promise<Response> {
    const response = await fetch(`${API}${path}`, {
      method,
      headers: { ...headers(), ...(body === undefined ? {} : { 'Content-Type': 'application/json' }) },
      body: body === undefined ? undefined : JSON.stringify(body),
    })
    if (!response.ok && response.status !== 404) throw new Error(`${method} ${path}: ${response.status} ${await response.text()}`)
    return response
  }
  async function pages<T>(path: string): Promise<T[]> {
    const all: T[] = []
    for (let page = 1; page < 50; page++) {
      const response = await call('GET', `${path}${path.includes('?') ? '&' : '?'}per_page=100&page=${page}`)
      if (response.status === 404) break
      const batch = (await response.json()) as T[]
      all.push(...batch)
      if (batch.length < 100) break
    }
    return all
  }
  return {
    async openPulls(owner, branch): Promise<PullRef[]> {
      type Pull = { number: number; head: { sha: string; repo: { full_name: string } | null } }
      const pulls = await pages<Pull>(`/repos/${repo}/pulls?state=open&head=${encodeURIComponent(`${owner}:${branch}`)}`)
      return pulls.map(p => ({ number: p.number, headSha: p.head.sha, headRepo: p.head.repo?.full_name ?? '' }))
    },
    async pullFiles(pr): Promise<PullFile[]> {
      type File = { filename: string; status: string; previous_filename?: string }
      const files = await pages<File>(`/repos/${repo}/pulls/${pr}/files`)
      return files.map(f => ({ filename: f.filename, status: f.status, ...(f.previous_filename ? { previousFilename: f.previous_filename } : {}) }))
    },
    async fileAt(fromRepo, path, sha) {
      const encoded = path.split('/').map(encodeURIComponent).join('/')
      const response = await fetch(`${API}/repos/${fromRepo}/contents/${encoded}?ref=${sha}`, { headers: headers('application/vnd.github.raw') })
      if (response.status === 404) return null
      if (!response.ok) throw new Error(`GET ${fromRepo}/${path}@${sha}: ${response.status}`)
      return Buffer.from(await response.arrayBuffer())
    },
    async reviews(pr): Promise<Review[]> {
      type Raw = { state: string; commit_id: string; author_association: string }
      return (await pages<Raw>(`/repos/${repo}/pulls/${pr}/reviews`)).map(r => ({
        state: r.state,
        commitId: r.commit_id,
        authorAssociation: r.author_association,
      }))
    },
    async comments(pr) {
      type Raw = { id: number; user: { login: string } | null; body: string | null }
      return (await pages<Raw>(`/repos/${repo}/issues/${pr}/comments`)).map(c => ({ id: c.id, login: c.user?.login ?? '', body: c.body ?? '' }))
    },
    async upsertComment(pr, existingId, body) {
      const text = body.length > MAX_COMMENT ? `${body.slice(0, MAX_COMMENT)}\n\n…truncated; see the review run for the rest.\n` : body
      if (existingId === null) await call('POST', `/repos/${repo}/issues/${pr}/comments`, { body: text })
      else await call('PATCH', `/repos/${repo}/issues/comments/${existingId}`, { body: text })
    },
    async setLabel(pr, name, present) {
      if (present) await call('POST', `/repos/${repo}/issues/${pr}/labels`, { labels: [name] })
      else await call('DELETE', `/repos/${repo}/issues/${pr}/labels/${encodeURIComponent(name)}`)
    },
    async setStatus(sha, state, description) {
      await call('POST', `/repos/${repo}/statuses/${sha}`, { state, context: 'claudemodz/review', description: description.slice(0, 140) })
    },
  }
}
