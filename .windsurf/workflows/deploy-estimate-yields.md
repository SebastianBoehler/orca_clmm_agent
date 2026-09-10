---
description: Deploy estimateYields Function
---

This workflow installs dependencies for the estimateYields Google Cloud Function and deploys it to Google Cloud Platform.
Steps:

Run npm i in the functions/estimateYields directory to install all required dependencies.
Also make sure to update force the orca-clmm-agent package to latest version, its published to npm
so dont use the local version
Deploy the function using:

gcloud functions deploy estimateYields \
 --gen2 \
 --runtime=nodejs22 \
 --region=us-central1 \
 --source=. \
 --entry-point=estimateYields \
 --trigger-http \
 --allow-unauthenticated \
 --env-vars-file=.env.yaml \
 --memory=512MB \
 --timeout=420s \
 --min-instances=0 \
 --max-instances=2 \
 --project=orca-clmm-agent
