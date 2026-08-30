export const GH_REPO = 'abretz50/rowan-acda';
export const GH_BRANCH = 'main';

export async function ghFetch(endpoint, method, body) {
  return fetch(`https://api.github.com/repos/${GH_REPO}/${endpoint}`, {
    method,
    headers: {
      Authorization: `token ${process.env.GITHUB_TOKEN}`,
      Accept: 'application/vnd.github.v3+json',
      'Content-Type': 'application/json',
      'User-Agent': 'rowan-acda-portal',
    },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });
}
