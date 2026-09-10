---
description: Deploy trendingPost Function to Google Cloud Functions
---

Follow these steps to deploy (or update) the **trendingPost** Cloud Function that returns trending Orca posts.

1. Ensure you are authenticated with gcloud and have the correct project selected:

Project name is orca-clmm-agent

```bash
gcloud auth login
gcloud config set project orca-clmm-agent
```

2. Navigate to the `functions/trendingPost` folder (this folder contains `index.ts`, `package.json`, and the Cloud Function code):

   cd into the trendigPost folder and then execute the deploy cmd

   `cd functions/trendingPost`

   ```bash
   gcloud functions deploy trendingPost \
     --region=us-central1 \
     --runtime=nodejs22 \
     --entry-point=trendingPost \
     --source=. \
     --trigger-http \
     --allow-unauthenticated \
     --memory=512MB \
     --timeout=60s \
     --env-vars-file=.env.yaml
   ```

3. Verify deployment:

   ```bash
   gcloud functions describe trendingPost --region=us-central1
   ```

   Note the `serviceConfig.uri` field – this is your HTTP endpoint.

4. (Optional) View logs:

   ```bash
   gcloud functions logs read trendingPost --region=us-central1 --limit 50
   ```

This workflow assumes you have `gcloud` ≥ 470 installed and Node.js 22 is available in your region. Update flags (memory, timeout) as needed.
