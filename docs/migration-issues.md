# Proposal migration review

All ten proposals use the shared format in `_posts/`. Scientific text,
references, existing names, filenames, publication dates and existing URLs are
preserved. No dummy names have been added. The migration is ready for Step 3
review; the development choices below must be corrected before release.

## Choices to review before release

The user explicitly requested random status choices for all ten proposals,
random eligibility for the five older proposals, and temporary workload splits
where the older sources supplied none. These are not confirmed project facts.

| Proposal | Status | Eligibility | Eligibility source | Workload |
| --- | --- | --- | --- | --- |
| AI Decision Support for Personalized Brain Health Risk Profiling | taken | Only BME students | User confirmed | Preserved from source |
| Gait Analysis via Wrist-Worn Accelerometers | taken | Only BME students | User confirmed | Preserved from source |
| Multimodal Digital Biomarkers for Early Brain Health Monitoring | available | Only BME students | User confirmed | Preserved from source |
| Quantification of writing and drawing from sensor data in people with Parkinson’s disease | archived | Only BME students | User confirmed | Preserved from source |
| Extracting Vital Sings from Seismic Signals | taken | BME students and AIM students | User confirmed | Preserved from source |
| Development and validation of a markerless motion tracking model | archived | Only BME students | Random, replace before release | Temporary, replace before release |
| Quantification of Daily Arm Use from IMU Data in Children with Hemiparesis | archived | Only BME students | Random, replace before release | Preserved from source |
| Gait Analysis from Seismographic Measurements on Healthy Individuals | taken | BME students and AIM students | Random, replace before release | Temporary, replace before release |
| AI-Based Algorithms for Automated Sleep Stage Classification from Ballistocardiogram Signals | taken | BME students and AIM students | Random, replace before release | Preserved from source |
| Analysis of Emotion-Related Pupillometry/Eyetracking in Parkinson’s Disease | archived | Only BME students | Random, replace before release | Preserved from source |

## Explicit confirmations

- Current proposals: BME only for AI decision support, wrist gait analysis,
  multimodal biomarkers and writing/drawing; BME and AIM for vital signs.
- The user confirmed existing contacts as supervisors for AI decision support,
  multimodal biomarkers, writing/drawing, markerless tracking and seismographic
  gait. Other named supervisors are preserved from their sources.
- The user confirmed ARTORG Center for Biomedical Engineering Research,
  University of Bern, Gerontechnology and Rehabilitation Group for writing/drawing,
  markerless tracking and seismographic gait. Existing affiliations, including
  the hospital affiliations on older proposals, are retained.
- The user approved the markerless proposal's existing Description as its Aim.
  Its text is reused verbatim, not rewritten.
- Approved temporary markerless workload: literature review 20%, model training
  50%, validation 30%.
- Approved temporary seismographic-gait workload: algorithm development 60%,
  data analysis and validation 40%.

## Source issues retained for editorial review

- The writing/drawing proposal refers to Figure 1, but no figure was supplied.
  Obtain the real figure, caption and alt text, or agree a correction. Do not
  insert the Word example's MRI.
- The older gait file is named `2025-09-04-...`, but its publication field is
  `2025-04-28 12:00:00`. Both are preserved, along with its existing URL.
- Existing start-date text, spelling and scientific statements are preserved
  rather than silently updated during migration.

## Identity, dates and old links

Each proposal has an immutable ID and an explicit permalink. Correcting
category metadata (including `Decsion Support`) does not change public URLs.
The five older proposals moved from `post_archive/` into `_posts/` without
renaming their files; their `/post_archive/<filename>/` URLs still work.
The former source folder is excluded from direct copying into the site.

Creation timestamps use the first recorded Git author event found along each
detected rename history. These are repository evidence, not verified dates of
original scientific authorship. Source commit evidence is recorded separately;
some commits only renamed files or changed publication dates. `updated_at`
records this migration's metadata changes. Original publication fields remain
unchanged. `_data/proposal_migration.yml` records the evidence and preserved
narrative fingerprints for all ten files.

## Release reminder requested by the user

**After all implementation steps, remind the user to replace the random
statuses, random older eligibility choices, and temporary workload splits with
correct values. Review team/profile content too; do not introduce dummy names.**

`bundle exec ruby scripts/validate-proposals.rb --strict` checks format and
completeness for all ten proposals. `--release` additionally rejects the
outstanding review issues recorded in `_data/proposal_migration.yml`. Remove a
blocker only when its underlying content has actually been resolved.

The complete page section order and branding are Step 4 work. For now a small
compatibility appendix keeps the metadata moved out of the old Markdown
(workload, supervisors, institutes, start date, workplace and contact) visible.
