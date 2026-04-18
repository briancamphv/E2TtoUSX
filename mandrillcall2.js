#!/usr/bin/env node

/**
 * probe-mailchimp-templates.js
 *
 * Usage:
 *   TRANSACTIONAL_KEY=xxx MARKETING_KEY=yyy MARKETING_SERVER_PREFIX=us21 node probe-mailchimp-templates.js
 *
 * Optional:
 *   TEMPLATE_NAME="welcome-email" node probe-mailchimp-templates.js
 */

const TRANSACTIONAL_KEY = "md-FrAFe38DpPXIVyYaQxMObA" || "";
const MARKETING_KEY = "f5b62e1c122ce67e0cecd445074efd25" || "";
const MARKETING_SERVER_PREFIX = "us10" || "";
const TEMPLATE_NAME = "OITP Life History From Template" || "";

async function postJson(url, body) {
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });

  const text = await res.text();
  let json;
  try {
    json = JSON.parse(text);
  } catch {
    json = { raw: text };
  }

  return {
    ok: res.ok,
    status: res.status,
    url,
    json,
  };
}

async function getJson(url, username, password) {
  const auth = Buffer.from(`${username}:${password}`).toString("base64");

  const res = await fetch(url, {
    method: "GET",
    headers: {
      Authorization: `Basic ${auth}`,
      "Content-Type": "application/json",
    },
  });

  const text = await res.text();
  let json;
  try {
    json = JSON.parse(text);
  } catch {
    json = { raw: text };
  }

  return {
    ok: res.ok,
    status: res.status,
    url,
    json,
  };
}

function summarizeListResult(label, result) {
  const { status, json } = result;

  if (Array.isArray(json)) {
    return {
      source: label,
      supported: true,
      status,
      count: json.length,
      names: json
        .map((t) => t?.name || t?.slug || t?.id || JSON.stringify(t))
        .slice(0, 25),
      rawType: "array",
    };
  }

  if (json && json.status === "error") {
    return {
      source: label,
      supported: false,
      status,
      errorName: json.name,
      errorCode: json.code,
      message: json.message,
      rawType: "error-object",
    };
  }

  if (json && Array.isArray(json.templates)) {
    return {
      source: label,
      supported: true,
      status,
      count: json.templates.length,
      names: json.templates
        .map((t) => t?.name || t?.slug || t?.id || JSON.stringify(t))
        .slice(0, 25),
      rawType: "templates-array",
    };
  }

  return {
    source: label,
    supported: result.ok,
    status,
    rawType: typeof json,
    preview: json,
  };
}

function extractFieldsFromHtml(html = "") {
  const handlebars = [...html.matchAll(/{{{?\s*([a-zA-Z0-9_.-]+)\s*}?}}/g)]
    .map((m) => m[1])
    .filter((v) => !["else"].includes(v) && !v.startsWith("#") && !v.startsWith("/"));

  const mcEdit = [...html.matchAll(/mc:edit=["']([^"']+)["']/g)].map((m) => m[1]);

  return {
    mergeFields: [...new Set(handlebars)].sort(),
    editableRegions: [...new Set(mcEdit)].sort(),
  };
}

async function main() {
  if (!TRANSACTIONAL_KEY && !MARKETING_KEY) {
    console.error(
      "Set at least one of TRANSACTIONAL_KEY or MARKETING_KEY. " +
      "For Marketing API also set MARKETING_SERVER_PREFIX, like us21."
    );
    process.exit(1);
  }

  const report = {
    transactional: {},
    marketing: {},
  };

  if (TRANSACTIONAL_KEY) {
    console.log("\n== Transactional API checks ==");

    // Validate transactional key
    const ping2 = await postJson(
      "https://mandrillapp.com/api/1.0/users/ping2.json",
      { key: TRANSACTIONAL_KEY }
    );
    report.transactional.ping2 = ping2;
    console.log("ping2:", JSON.stringify(ping2.json, null, 2));

    // Legacy Mandrill templates
    const legacyList = await postJson(
      "https://mandrillapp.com/api/1.0/templates/list.json",
      { key: TRANSACTIONAL_KEY, label: null }
    );
    report.transactional.templatesList = legacyList;
    console.log(
      "templates/list summary:",
      JSON.stringify(summarizeListResult("templates/list", legacyList), null, 2)
    );

    // Newer Mailchimp Transactional templates
    const mcTemplatesList = await postJson(
      "https://mandrillapp.com/api/1.0/mctemplates/list.json",
      { key: TRANSACTIONAL_KEY, label: null }
    );
    report.transactional.mcTemplatesList = mcTemplatesList;
    console.log(
      "mctemplates/list summary:",
      JSON.stringify(summarizeListResult("mctemplates/list", mcTemplatesList), null, 2)
    );

    if (TEMPLATE_NAME) {
      console.log(`\n== Template detail checks for "${TEMPLATE_NAME}" ==`);

      const legacyInfo = await postJson(
        "https://mandrillapp.com/api/1.0/templates/info.json",
        { key: TRANSACTIONAL_KEY, name: TEMPLATE_NAME }
      );
      report.transactional.templateInfo = legacyInfo;
      console.log("templates/info:", JSON.stringify(legacyInfo.json, null, 2));

      const mcInfo = await postJson(
        "https://mandrillapp.com/api/1.0/mctemplates/info.json",
        { key: TRANSACTIONAL_KEY, name: TEMPLATE_NAME }
      );
      report.transactional.mcTemplateInfo = mcInfo;
      console.log("mctemplates/info:", JSON.stringify(mcInfo.json, null, 2));

      const candidateHtml =
        legacyInfo?.json?.code ||
        legacyInfo?.json?.publish_code ||
        legacyInfo?.json?.html ||
        mcInfo?.json?.code ||
        mcInfo?.json?.publish_code ||
        mcInfo?.json?.html ||
        "";

      if (candidateHtml) {
        console.log(
          "extracted fields:",
          JSON.stringify(extractFieldsFromHtml(candidateHtml), null, 2)
        );
      } else {
        console.log("No HTML/code found to extract fields from.");
      }
    }
  }

  if (MARKETING_KEY && MARKETING_SERVER_PREFIX) {
    console.log("\n== Marketing API checks ==");

    const marketingUrl =
      `https://${MARKETING_SERVER_PREFIX}.api.mailchimp.com/3.0/templates?count=100`;

    const marketingList = await getJson(marketingUrl, "anystring", MARKETING_KEY);
    report.marketing.templates = marketingList;

    const summary = {
      source: "marketing /templates",
      supported: marketingList.ok,
      status: marketingList.status,
      count: marketingList?.json?.templates?.length ?? 0,
      names: (marketingList?.json?.templates || [])
        .map((t) => t?.name || t?.id)
        .slice(0, 25),
      total_items: marketingList?.json?.total_items,
    };

    console.log("marketing/templates summary:", JSON.stringify(summary, null, 2));
  } else if (MARKETING_KEY || MARKETING_SERVER_PREFIX) {
    console.log(
      "\nSkipping Marketing API test because you must set both MARKETING_KEY and MARKETING_SERVER_PREFIX."
    );
  }

  console.log("\n== Final diagnosis ==");

  const legacyNames = Array.isArray(report?.transactional?.templatesList?.json)
    ? report.transactional.templatesList.json.map((t) => t.name)
    : [];

  const mcNames = Array.isArray(report?.transactional?.mcTemplatesList?.json)
    ? report.transactional.mcTemplatesList.json.map((t) => t.name)
    : [];

  const marketingNames = report?.marketing?.templates?.json?.templates
    ? report.marketing.templates.json.templates.map((t) => t.name)
    : [];

  console.log(JSON.stringify({
    transactionalPingWorks:
      report?.transactional?.ping2?.json === "PONG!" ||
      report?.transactional?.ping2?.json?.PING === "PONG!" ||
      report?.transactional?.ping2?.ok === true,
    legacyMandrillTemplatesVisible: legacyNames.length > 0,
    mcTransactionalTemplatesVisible: mcNames.length > 0,
    marketingTemplatesVisible: marketingNames.length > 0,
    legacyTemplateNamesSample: legacyNames.slice(0, 10),
    mcTransactionalTemplateNamesSample: mcNames.slice(0, 10),
    marketingTemplateNamesSample: marketingNames.slice(0, 10),
  }, null, 2));
}

main().catch((err) => {
  console.error("Fatal error:", err);
  process.exit(1);
});