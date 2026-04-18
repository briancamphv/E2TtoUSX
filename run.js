const MailchimpTemplateMergeFields = require("./mailchimp-template-merge-fields");

async function run() {
  const mc = new MailchimpTemplateMergeFields({
    apiKey: "f5b62e1c122ce67e0cecd445074efd25",
    serverPrefix: "us10",
  });

  const result = await mc.getMergeFieldsByTemplateName("OITP Preliminary Application Form", {
    includeDefaultContent: true,
    // optional if you want tag -> audience field mapping
    listId: "91b1a26d57",
  });

  console.dir(result, { depth: null });
}

run().catch(console.error);