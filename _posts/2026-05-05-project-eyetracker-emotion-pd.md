---
layout: post
title: Analysis of Emotion-Related Pupillometry/Eyetracking in Parkinson’s Disease
date: 2026-05-05 09:00:00
summary: Project Proposal
categories:
- parkinson
schema_version: 1
template_version: 1
priority: 100
featured: false
language: en
tags: []
attachments: []
submission_email: bme.artorg@unibe.ch
status: archived
student_eligibility: bme_only
proposal_id: ger-eyetracker-emotion-pd
permalink: "/post_archive/2026-05-05-project-eyetracker-emotion-pd/"
created_at: '2025-09-01T09:46:35Z'
updated_at: '2026-11-11T16:28:39Z'
contact:
  name: Aaron Colombo, MSc
  email: aaron.colombo@unibe.ch
application_instructions: Apply for this project by sending your CV, course transcripts,
  and a short motivation letter (max. ¾ A4 page) to [aaron.colombo@unibe.ch](mailto:aaron.colombo@unibe.ch)
  with "MT Eye Emotion PD - Firstname Lastname" as the subject.
supervisors:
- name: Prof. Dr. Tobias Nef
- name: Dr. Deborah Amstutz
- name: Matilde Castelli, MSc
- name: Aaron Colombo, MSc
institutes:
- name: Gerontechnology and Rehabilitation Group, ARTORG Center for Biomedical Engineering
    Research, University of Bern
  url: https://www.artorg.unibe.ch/research/ger/index_eng.html
- name: Center for Parkinson’s and Movement Disorder, Department of Neurology, Bern
    University Hospital and University of Bern
  url: https://neurologie.insel.ch/de/unser-angebot/zentrum-fuer-parkinson-und-bewegungsstoerungen
start_date_text: September 2025 or upon agreement.
workplace: ARTORG Center (SITEM, Freiburgstrasse 3) on the Insel hospital campus.
workload:
- activity: Data preprocessing & dataset construction
  percentage: 50
- activity: Statistical modelling & interpretation
  percentage: 50
---
## Background

Parkinson’s disease (PD) is not only characterized by motor symptoms but also by non-motor symptoms such as depression, anxiety, apathy, and impulse control disorders, which may affect emotion processing (Weintraub & Mamikonyan, 2019). Deficits in recognizing negative emotions such as anger, disgust, fear, and sadness are frequently reported in PD (Argaud et al., 2018). Pupillometry is a promising marker for emotion processing, but raw pupil data are noisy and require careful preprocessing. Advanced statistical models, such as linear mixed models (LMM) and generalized additive mixed models (GAMM), provide a framework to capture both inter- and intra-individual variability, as well as non-linear trajectories over time, which have not yet been fully exploited in this context.

## Aim

The aim of this thesis is to establish a high-quality, cleaned dataset of pupillometry responses and gaze location from PD patients during an emotional picture-rating task. Using advanced statistical models, you will investigate whether pupillary responses differ across pleasant, unpleasant, and neutral stimuli, and how they are modulated by clinical measures such as depression, anxiety, apathy, or impulse control disorders. In a sub-cohort, you will investigate the effect of deep brain stimulation (before/after surgery) on pupillometry and gaze during the task.

## Materials and Methods

You will start from the raw pupillometry recordings acquired during the International Affective Picture System (IAPS) task in PD patients treated with subthalamic nucleus deep brain stimulation (STN-DBS). The first stage will involve the development of a rigorous preprocessing pipeline, including blink detection, interpolation, baseline correction/normalization, resulting in a cleaned dataset. You will start exploring the data with visual plotting and basic statistics. Furthermore, you will apply advanced statistical modeling LMMs to account for repeated measures and nested data structures, and GAMM to model potential non-linear pupil dynamics across time. Predictors will include stimulus category (pleasant, unpleasant, neutral), or ratings, while controlling for measures of neuropsychiatric symptoms (HADS, QUIP-RS, Starkstein Apathy Scale, MoCA).

## Requirements

- Good programming and data analysis skills in Python and/or R
- Familiarity with time-series data
- Experience with statistical methods (LMM/GAMM) will be an advantage (but is not necessary)
- Interest in neuroscience and clinical research

## References

Argaud, S., Vérin, M., Sauleau, P., & Grandjean, D. (2018). Facial emotion recognition in Parkinson’s disease: A review and new hypotheses. Movement Disorders, 33(4), 554–567. [https://doi.org/10.1002/mds.27305](https://doi.org/10.1002/mds.27305)

Weintraub, D., & Mamikonyan, E. (2019). The Neuropsychiatry of Parkinson Disease: A Perfect Storm. The American Journal of Geriatric Psychiatry, 27(9), 998–1018. [https://doi.org/10.1016/j.jagp.2019.03.002](https://doi.org/10.1016/j.jagp.2019.03.002)
