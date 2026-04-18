// mailchimp-template-merge-fields.js
// Node 18+ (uses built-in fetch)
// CommonJS module

class MailchimpTemplateMergeFields {
  constructor({ apiKey, serverPrefix }) {
    if (!apiKey) throw new Error("apiKey is required");
    if (!serverPrefix) throw new Error("serverPrefix is required, e.g. us21");

    this.apiKey = apiKey;
    this.serverPrefix = serverPrefix;
    this.baseUrl = `https://${serverPrefix}.api.mailchimp.com/3.0`;
  }

  _headers() {
    const auth = Buffer.from(`anystring:${this.apiKey}`).toString("base64");
    return {
      Authorization: `Basic ${auth}`,
      "Content-Type": "application/json",
    };
  }

  async _get(path) {
    const res = await fetch(`${this.baseUrl}${path}`, {
      method: "GET",
      headers: this._headers(),
    });

    const text = await res.text();
    let json;
    try {
      json = JSON.parse(text);
    } catch {
      json = { raw: text };
    }

    if (!res.ok) {
      const detail = json?.detail || json?.title || text;
      throw new Error(`Mailchimp GET ${path} failed: ${res.status} ${detail}`);
    }

    return json;
  }

  async listTemplates({ count = 100, offset = 0 } = {}) {
    return this._get(`/templates?count=${count}&offset=${offset}`);
  }

  async getTemplateByName(templateName) {
    if (!templateName) throw new Error("templateName is required");

    let offset = 0;
    const count = 100;

    while (true) {
      const page = await this.listTemplates({ count, offset });
      const templates = page.templates || [];

      const exact = templates.find(
        (t) => (t.name || "").trim().toLowerCase() === templateName.trim().toLowerCase()
      );

      if (exact) return exact;

      const returned = templates.length;
      const total = page.total_items || 0;

      offset += returned;
      if (returned === 0 || offset >= total) break;
    }

    return null;
  }

  async getTemplate(templateId) {
    if (!templateId) throw new Error("templateId is required");
    return this._get(`/templates/${templateId}`);
  }

  async getTemplateDefaultContent(templateId) {
    if (!templateId) throw new Error("templateId is required");
    return this._get(`/templates/${templateId}/default-content`);
  }

  async listAudienceMergeFields(listId, { count = 1000, offset = 0 } = {}) {
    if (!listId) throw new Error("listId is required");
    return this._get(`/lists/${listId}/merge-fields?count=${count}&offset=${offset}`);
  }

  async getAllAudienceMergeFields(listId) {
    let offset = 0;
    const count = 1000;
    const all = [];

    while (true) {
      const page = await this.listAudienceMergeFields(listId, { count, offset });
      const fields = page.merge_fields || [];
      all.push(...fields);

      const total = page.total_items || fields.length;
      offset += fields.length;

      if (fields.length === 0 || offset >= total) break;
    }

    return all;
  }

  extractMergeTags(html = "") {
    // Standard Mailchimp merge tags, examples:
    // *|FNAME|*  *|LNAME|*  *|EMAIL|*  *|UNSUB|*
    // Also catches conditional/system tags like *|IF:MMERGE5|*
    const allTags = [...html.matchAll(/\*\|([A-Z0-9_:%-]+)\|\*/gi)].map((m) => m[1]);

    const unique = [...new Set(allTags)].sort();

    const audienceLike = [];
    const systemLike = [];

    for (const tag of unique) {
      if (
        tag.startsWith("IF:") ||
        tag.startsWith("END:") ||
        tag.startsWith("ELSE:") ||
        [
          "ARCHIVE",
          "LIST",
          "UNSUB",
          "UPDATE_PROFILE",
          "EMAIL",
          "FNAME",
          "LNAME",
          "ADDRESS",
          "PHONE",
          "COMPANY",
        ].includes(tag)
      ) {
        systemLike.push(tag);
      } else {
        audienceLike.push(tag);
      }
    }

    return {
      all: unique,
      audienceLike,
      systemLike,
    };
  }

  mapToAudienceFields(extractedTags, audienceMergeFields) {
    const byTag = new Map(
      audienceMergeFields.map((f) => [String(f.tag || "").toUpperCase(), f])
    );

    return extractedTags.map((tag) => {
      const match = byTag.get(String(tag).toUpperCase());
      return {
        tag,
        matched: !!match,
        field: match
          ? {
              merge_id: match.merge_id,
              name: match.name,
              tag: match.tag,
              type: match.type,
              required: match.required,
              public: match.public,
              display_order: match.display_order,
              default_value: match.default_value,
            }
          : null,
      };
    });
  }

  /**
   * Main function:
   * pass a template name, get merge fields back.
   *
   * options:
   * - includeDefaultContent: also fetch /default-content
   * - listId: if provided, enrich extracted tags against audience merge fields
   */
  async getMergeFieldsByTemplateName(
    templateName,
    { includeDefaultContent = true, listId = null } = {}
  ) {
    const templateSummary = await this.getTemplateByName(templateName);

    if (!templateSummary) {
      throw new Error(`Template not found: ${templateName}`);
    }

    const templateId = templateSummary.id;
    const template = await this.getTemplate(templateId);

    const html = template.html || "";
    const extracted = this.extractMergeTags(html);

    let defaultContent = null;
    if (includeDefaultContent) {
      try {
        defaultContent = await this.getTemplateDefaultContent(templateId);
      } catch (err) {
        defaultContent = { error: err.message };
      }
    }

    let audienceFields = null;
    let mappedAudienceFields = null;

    if (listId) {
      audienceFields = await this.getAllAudienceMergeFields(listId);
      mappedAudienceFields = this.mapToAudienceFields(
        extracted.all,
        audienceFields
      );
    }

    return {
      template: {
        id: template.id,
        name: template.name,
        type: template.type,
        drag_and_drop: template.drag_and_drop,
        responsive: template.responsive,
        category: template.category,
        thumbnail: template.thumbnail,
      },
      mergeFields: extracted,
      mappedAudienceFields,
      defaultContent,
    };
  }
}

module.exports = MailchimpTemplateMergeFields;