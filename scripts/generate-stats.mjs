/**
 * Gera os cards de estatísticas do perfil a partir da API GraphQL do GitHub.
 *
 * Escreve assets/stats.svg (inglês) e assets/stats.pt-BR.svg (português).
 * Roda no GitHub Actions pelo workflow .github/workflows/stats.yml.
 *
 * Não usa serviço de terceiro: o SVG é commitado no próprio repositório, então
 * o README continua funcionando mesmo que qualquer serviço externo saia do ar.
 */

const USER = "tavinholoco";
const TOKEN = process.env.GITHUB_TOKEN;

if (!TOKEN) {
  console.error("GITHUB_TOKEN ausente.");
  process.exit(1);
}

const QUERY = `
query($login: String!) {
  user(login: $login) {
    contributionsCollection {
      totalCommitContributions
      totalPullRequestContributions
      totalIssueContributions
      contributionCalendar { totalContributions }
    }
    repositories(first: 100, ownerAffiliations: OWNER, privacy: PUBLIC) {
      totalCount
      nodes {
        languages(first: 10) {
          edges { size node { name color } }
        }
      }
    }
  }
}`;

async function fetchStats() {
  const res = await fetch("https://api.github.com/graphql", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${TOKEN}`,
      "Content-Type": "application/json",
      "User-Agent": USER,
    },
    body: JSON.stringify({ query: QUERY, variables: { login: USER } }),
  });

  if (!res.ok) throw new Error(`GraphQL HTTP ${res.status}: ${await res.text()}`);

  const json = await res.json();
  if (json.errors) throw new Error(`GraphQL: ${JSON.stringify(json.errors)}`);

  const user = json.data.user;
  const c = user.contributionsCollection;

  const totals = new Map();
  for (const repo of user.repositories.nodes) {
    for (const { size, node } of repo.languages.edges) {
      const prev = totals.get(node.name) ?? { size: 0, color: node.color };
      prev.size += size;
      totals.set(node.name, prev);
    }
  }

  const languages = [...totals.entries()]
    .map(([name, v]) => ({ name, size: v.size, color: v.color || "#8b949e" }))
    .sort((a, b) => b.size - a.size)
    .slice(0, 5);

  const totalBytes = languages.reduce((sum, l) => sum + l.size, 0);

  return {
    contributions: c.contributionCalendar.totalContributions,
    commits: c.totalCommitContributions,
    pullRequests: c.totalPullRequestContributions,
    issues: c.totalIssueContributions,
    repos: user.repositories.totalCount,
    languages: languages.map((l) => ({
      ...l,
      pct: totalBytes ? (l.size / totalBytes) * 100 : 0,
    })),
  };
}

// Paleta tokyonight, a mesma que o card anterior usava.
const T = {
  bg: "#1a1b27",
  border: "#2f3348",
  title: "#70a5fd",
  label: "#a9b1d6",
  value: "#38bdae",
  muted: "#565f89",
};

const FONT =
  "-apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,Arial,sans-serif";

const esc = (s) =>
  String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

const nf = (n, locale) => new Intl.NumberFormat(locale).format(n);

function render(stats, strings, locale) {
  const W = 500;
  const H = 205;
  const rows = [
    [strings.contributions, stats.contributions],
    [strings.commits, stats.commits],
    [strings.pullRequests, stats.pullRequests],
    [strings.issues, stats.issues],
  ];

  const statLines = rows
    .map(([label, value], i) => {
      const y = 78 + i * 25;
      return `  <text x="28" y="${y}" class="label">${esc(label)}</text>
  <text x="250" y="${y}" class="value" text-anchor="end">${esc(nf(value, locale))}</text>`;
    })
    .join("\n");

  // Barra empilhada das linguagens.
  const barX = 285;
  const barY = 66;
  const barW = 190;
  let offset = 0;
  const segments = stats.languages
    .map((l) => {
      const w = (l.pct / 100) * barW;
      const rect = `  <rect x="${(barX + offset).toFixed(1)}" y="${barY}" width="${w.toFixed(1)}" height="8" fill="${esc(l.color)}"/>`;
      offset += w;
      return rect;
    })
    .join("\n");

  const legend = stats.languages
    .map((l, i) => {
      const y = 92 + i * 21;
      return `  <circle cx="${barX + 5}" cy="${y - 4}" r="5" fill="${esc(l.color)}"/>
  <text x="${barX + 18}" y="${y}" class="lang">${esc(l.name)}</text>
  <text x="${barX + barW}" y="${y}" class="pct" text-anchor="end">${l.pct.toFixed(1)}%</text>`;
    })
    .join("\n");

  return `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}" role="img" aria-label="${esc(strings.alt)}">
  <title>${esc(strings.alt)}</title>
  <style>
    .title { font: 600 16px ${FONT}; fill: ${T.title}; }
    .sub   { font: 400 11px ${FONT}; fill: ${T.muted}; }
    .label { font: 400 13px ${FONT}; fill: ${T.label}; }
    .value { font: 600 13px ${FONT}; fill: ${T.value}; }
    .lang  { font: 400 12px ${FONT}; fill: ${T.label}; }
    .pct   { font: 400 12px ${FONT}; fill: ${T.muted}; }
    .head  { font: 600 12px ${FONT}; fill: ${T.title}; }
  </style>
  <rect x="0.5" y="0.5" width="${W - 1}" height="${H - 1}" rx="8" fill="${T.bg}" stroke="${T.border}"/>
  <text x="28" y="34" class="title">${esc(strings.title)}</text>
  <text x="28" y="51" class="sub">${esc(strings.subtitle)}</text>
${statLines}
  <text x="${barX}" y="51" class="head">${esc(strings.languages)}</text>
${segments}
${legend}
  <text x="28" y="${H - 16}" class="sub">${esc(strings.updated)}</text>
</svg>
`;
}

const stats = await fetchStats();

const updatedEn = new Date().toISOString().slice(0, 10);

const en = render(
  stats,
  {
    title: "GitHub activity",
    subtitle: `Last 12 months across ${stats.repos} public repositories`,
    contributions: "Contributions",
    commits: "Commits",
    pullRequests: "Pull requests",
    issues: "Issues",
    languages: "Languages by bytes of code",
    updated: `Updated ${updatedEn}`,
    alt: `GitHub activity for ${USER}: ${stats.contributions} contributions, ${stats.commits} commits and ${stats.pullRequests} pull requests in the last 12 months`,
  },
  "en-US",
);

const pt = render(
  stats,
  {
    title: "Atividade no GitHub",
    subtitle: `Últimos 12 meses em ${stats.repos} repositórios públicos`,
    contributions: "Contribuições",
    commits: "Commits",
    pullRequests: "Pull requests",
    issues: "Issues",
    languages: "Linguagens por bytes de código",
    updated: `Atualizado em ${updatedEn}`,
    alt: `Atividade de ${USER} no GitHub: ${stats.contributions} contribuições, ${stats.commits} commits e ${stats.pullRequests} pull requests nos últimos 12 meses`,
  },
  "pt-BR",
);

const { writeFile, mkdir } = await import("node:fs/promises");
await mkdir("assets", { recursive: true });
await writeFile("assets/stats.svg", en, "utf8");
await writeFile("assets/stats.pt-BR.svg", pt, "utf8");

console.log(
  `stats: ${stats.contributions} contribuicoes, ${stats.commits} commits, ${stats.pullRequests} PRs, ${stats.issues} issues`,
);
console.log(
  `linguagens: ${stats.languages.map((l) => `${l.name} ${l.pct.toFixed(1)}%`).join(", ")}`,
);
