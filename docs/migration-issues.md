# Proposal migration review

All ten proposals use the shared format in `_posts/`. Scientific text,
references, existing names, filenames, publication dates and existing URLs are
preserved. The user completed the final content review on 2026-11-16, applied
on 2026-11-18. Both temporary example profiles were removed at their request.
The editorial release check now passes; live hosting remains a separate gate.

## Confirmed final choices

The user explicitly requested random status choices for all ten proposals,
random eligibility for the five older proposals, and temporary workload splits
where the older sources supplied none. They then confirmed the final values
below, including all workload percentages. Historical random/temporary flags in
the migration record describe the original migration; final confirmations are
recorded separately rather than erasing that history.

| Proposal | Status | Eligibility | Eligibility source | Workload |
| --- | --- | --- | --- | --- |
| AI Decision Support for Personalized Brain Health Risk Profiling | available | Only BME students | User confirmed | Preserved and confirmed |
| Gait Analysis via Wrist-Worn Accelerometers | taken | Only BME students | User confirmed | Preserved from source |
| Multimodal Digital Biomarkers for Early Brain Health Monitoring | available | Only BME students | User confirmed | Preserved from source |
| Quantification of writing and drawing from sensor data in people with Parkinson’s disease | archived | Only BME students | User confirmed | Preserved from source |
| Extracting Vital Sings from Seismic Signals | taken | BME students and AIM students | User confirmed | Preserved from source |
| Development and validation of a markerless motion tracking model | archived | BME students and AIM students | User confirmed | 20% literature, 50% training, 30% validation; confirmed |
| Quantification of Daily Arm Use from IMU Data in Children with Hemiparesis | archived | Only BME students | User confirmed | Preserved and confirmed |
| Gait Analysis from Seismographic Measurements on Healthy Individuals | taken | BME students and AIM students | User confirmed | 60% algorithm development, 40% analysis/validation; confirmed |
| AI-Based Algorithms for Automated Sleep Stage Classification from Ballistocardiogram Signals | taken | BME students and AIM students | User confirmed | Preserved and confirmed |
| Analysis of Emotion-Related Pupillometry/Eyetracking in Parkinson’s Disease | archived | BME students and AIM students | User confirmed | Preserved and confirmed |

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
- Confirmed final markerless workload: literature review 20%, model training
  50%, validation 30%.
- Confirmed final seismographic-gait workload: algorithm development 60%,
  data analysis and validation 40%.

## Source issues retained for editorial review

- The user requested removal of only “(see Figure 1)” from writing/drawing.
  This correction is applied; no replacement figure or scientific text was
  invented. The original narrative fingerprint remains, with an approved
  reversible text exception checked by the migration test.
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
advances only on substantive changes, including the final status/eligibility and
writing/drawing corrections. Original publication fields remain
unchanged. `_data/proposal_migration.yml` records the evidence and preserved
narrative fingerprints for all ten files.

## Release reminder requested by the user

The reminder was given during Step 25. The user confirmed all ten statuses,
older eligibility and every workload percentage, removed the missing figure
reference, and requested removal of Max Mustermann and Petra Musterfrau.
Max's example supervisor entry was removed; Kevin Möri remains. Team is empty
until real profiles are supplied. No replacement names were invented.

`bundle exec ruby scripts/validate-proposals.rb --strict` checks format and
completeness for all ten proposals. `--release` additionally rejects the
editorial issues recorded in `_data/proposal_migration.yml`. The five recorded
groups are now resolved by these explicit confirmations. This command does not
verify hosting or authorize deployment; see the [release handover](release-handover.md).

Public pages, editor preview and PDFs use the shared section rendering and
branding. Staff submission instructions remain in source/templates and are
omitted from public pages/PDFs at the user's request.
