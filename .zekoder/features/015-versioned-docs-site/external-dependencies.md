# Multi-language versioned documentation site — External dependencies

## 1. Docs bucket, Cloud Run service, image repository and publisher identity

- **Type:** GCP infrastructure + GitHub repository variables (non-coding).
- **Owner:** Cybernetic Labs maintainer with GCP project and repo admin access.
- **Blocks:** first real publish only. Package 02 merges and its tests run without it; the `docs` job skips with a notice while every docs var is unset.
- **Related contract:** docs-hosting.

Tasks:

- [ ] Create a private bucket (for example `zekoder-docs`, uniform access, no public read).
- [ ] Create an Artifact Registry Docker repository (for example `REGION-docker.pkg.dev/PROJECT/zekoder-docs`).
- [ ] Create runtime service account `docs-runtime` with `roles/storage.objectViewer` on the bucket.
- [ ] Create Cloud Run service `zekoder-docs` once (placeholder image `us-docker.pkg.dev/cloudrun/container/hello`), runtime SA `docs-runtime`, min instances 0, max instances 2, and grant `roles/run.invoker` to `allUsers`. First check the org policy `iam.allowedPolicyMemberDomains` (`gcloud resource-manager org-policies describe iam.allowedPolicyMemberDomains --project PROJECT --effective`); if it blocks `allUsers`, get a project-level exception before granting. Use a region that supports domain mapping, and put the Artifact Registry repository in the same region.
- [ ] Create publisher service account `docs-publisher`: `roles/storage.objectAdmin` on the bucket, `roles/artifactregistry.writer` on the repository, `roles/run.developer` on the service, `roles/iam.serviceAccountUser` on `docs-runtime`. Let the existing workload identity provider (`GCP_WORKLOAD_IDENTITY_PROVIDER`) impersonate it for `cyberneticlabs/zekoder-studio` tag refs.
- [ ] Map `docs.zekoder.com` to the service (Cloud Run domain mapping) and add the DNS records it prints.
- [ ] Set repo variables `ZEKODER_DOCS_BUCKET`, `GCP_DOCS_SERVICE_ACCOUNT`, `DOCS_IMAGE_REPOSITORY`, `DOCS_CLOUD_RUN_SERVICE`, `DOCS_CLOUD_RUN_REGION`. No keys or secrets are committed or stored.
