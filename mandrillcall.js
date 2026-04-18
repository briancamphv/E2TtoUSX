async function mandrillCall(endpoint, body) {
  const res = await fetch(`https://mandrillapp.com/api/1.0/${endpoint}.json`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    throw new Error(`Mandrill ${endpoint} failed: ${res.status} ${await res.text()}`);
  }
  return res.json();
}

async function getTemplates(apiKey) {
  return mandrillCall("templates/list", { key: apiKey, label: null });
}

async function getTemplateInfo(apiKey, name) {
  return mandrillCall("templates/info", { key: apiKey, name });
}

function extractFieldsFromHtml(html = "") {
  const handlebars = [...html.matchAll(/{{{?\s*([a-zA-Z0-9_.]+)\s*}?}}/g)]
    .map(m => m[1])
    .filter(v => !v.startsWith("#") && !v.startsWith("/") && v !== "else");

  const mcEdit = [...html.matchAll(/mc:edit=["']([^"']+)["']/g)].map(m => m[1]);

  return {
    mergeFields: [...new Set(handlebars)],
    editableRegions: [...new Set(mcEdit)],
  };
}

// usage
(async () => {
  const apiKey = "md-FrAFe38DpPXIVyYaQxMObA";

  const templates = await getTemplates(apiKey);
  console.log("templates:", templates.map(t => t.name));

  const info = await getTemplateInfo(apiKey, "OITP Life History From Template");
  const html = info.code || info.publish_code || info.html || "";
  const fields = extractFieldsFromHtml(html);

  console.log(fields);
})();