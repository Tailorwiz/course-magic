// Query Railway GraphQL for the exact DNS records the custom domains require.
const TOKEN = process.env.RAILWAY_API_TOKEN;
const SERVICE_ID = 'ab457b8d-2427-4aba-b7db-4737475ce91a';
const ENV_ID = '547708e2-5a82-4448-8065-37d27b9fac67';
const PROJECT_ID = '44fcad60-f8d7-42be-a1f1-0c4987da7b8b';

const query = `
query getDomainDetails($projectId: String!, $serviceId: String!, $environmentId: String!) {
  domains(projectId: $projectId, serviceId: $serviceId, environmentId: $environmentId) {
    customDomains {
      id
      domain
      targetPort
      status {
        dnsRecords {
          recordType
          hostlabel
          requiredValue
          currentValue
          status
          fqdn
          zone
        }
      }
    }
    serviceDomains {
      id
      domain
      targetPort
    }
  }
}`;

const res = await fetch('https://backboard.railway.app/graphql/v2', {
  method: 'POST',
  headers: { 'Authorization': `Bearer ${TOKEN}`, 'Content-Type': 'application/json' },
  body: JSON.stringify({ query, variables: { projectId: PROJECT_ID, serviceId: SERVICE_ID, environmentId: ENV_ID } }),
});
const json = await res.json();
console.log(JSON.stringify(json, null, 2));
