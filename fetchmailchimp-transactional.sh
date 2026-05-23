
  #NOTE IGNORE THE KEY. THIS IS A TEST KEY. DO NOT USE IT.
  # get the list of templates (includes .publish_code per template)
  curl -X POST \
  https://mandrillapp.com/api/1.3/mctemplates/list \
  -d '{"key":"md-avu1iIZu1Cb4jgKCyWsP_g","search_query":""}'
  
  #gets one template
  curl https://mandrillapp.com/api/1.3/mctemplates/info.json \
  -X POST \
  -H "Content-Type: application/json" \
  -d '{
    "key": "md-avu1iIZu1Cb4jgKCyWsP_g",
    "mc_template_id":10746279
  }'

  # to get the merge fields run regex on the html code of the template (.publish_code)
  #regex is \*\|([^|]+?)\|\*
  # do regex as global to get all merge fields. 

  # example transactional email using the template and merge fields -  I think this works, but 
  # not 100% sure.
  curl https://mandrillapp.com/api/1.3/messages/send-mc-template.json \
  -X POST \
  -H "Content-Type: application/json" \
  -d '{
    "key": "md-avu1iIZu1Cb4jgKCyWsP_g",
    "mc_template_id": 10746279,
    "template_content": [],
    "message": {
      "subject": "Test transactional send",
      "from_email": "info@techteam.org",
      "from_name": "Your App",
      "to": [
        {
          "email": "dharding@techteam.org",
          "type": "to"
        }
      ],
      "global_merge_vars": [
        { "name": "Fname", "content": "Brian" },
        { "name": "Occupation", "content": "Developer" }
      ],
      "merge_language": "mailchimp"
    }
  }'