// Netlify Function — Proxy Jira API
// Credenciales: JIRA_EMAIL y JIRA_TOKEN en env vars de Netlify
exports.handler = async function(event) {
  const email = process.env.JIRA_EMAIL;
  const token = process.env.JIRA_TOKEN;

  if (!email || !token) {
    return {
      statusCode: 500,
      headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' },
      body: JSON.stringify({ error: 'Credenciales no configuradas en Netlify (JIRA_EMAIL / JIRA_TOKEN)' })
    };
  }

  const auth = Buffer.from(`${email}:${token}`).toString('base64');

  // JQL: tickets ITHD asignados a Juan Pinzon y Anlly Giraldo
  const jql = process.env.JIRA_JQL ||
    'project = ITHD AND assignee in ("Juan.pinzon@ixcomercio.com") ORDER BY updated DESC';

  const fields = 'summary,status,assignee,priority,created,updated';
  const url = `https://ixglobalit.atlassian.net/rest/api/3/search?jql=${encodeURIComponent(jql)}&maxResults=200&fields=${fields}`;

  try {
    const res = await fetch(url, {
      headers: {
        'Authorization': `Basic ${auth}`,
        'Accept': 'application/json'
      }
    });

    const data = await res.json();

    if (!res.ok) {
      return {
        statusCode: res.status,
        headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' },
        body: JSON.stringify({ error: (data.errorMessages || [data.message] || ['Error Jira API']).join(', ') })
      };
    }

    const issues = (data.issues || []).map(i => ({
      key:         i.key,
      summary:     i.fields.summary || '',
      status:      i.fields.status?.name || '',
      cat:         i.fields.status?.statusCategory?.key || '',
      asignado:    i.fields.assignee?.displayName || 'Sin asignar',
      email:       i.fields.assignee?.emailAddress || '',
      prioridad:   i.fields.priority?.name || '',
      creado:      (i.fields.created || '').slice(0, 10),
      actualizado: (i.fields.updated || '').slice(0, 10),
    }));

    return {
      statusCode: 200,
      headers: {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*',
        'Cache-Control': 'no-cache'
      },
      body: JSON.stringify({
        total: data.total,
        issues,
        ts: new Date().toISOString()
      })
    };
  } catch (err) {
    return {
      statusCode: 500,
      headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' },
      body: JSON.stringify({ error: err.message })
    };
  }
};
