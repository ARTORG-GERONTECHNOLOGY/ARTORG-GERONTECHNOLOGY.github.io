---
layout: post
title: AI Decision Support for Personalized Brain Health Risk Profiling
date: 2026-05-05 12:00:00
summary: Project Proposal
categories:
- decision-support
status: available
student_eligibility: bme_only
supervisors:
- name: Dr. Vassilis Skaramagkas
schema_version: 1
template_version: 1
proposal_id: ger-ai-decision-support-for-personalized-brain-health-risk-profiling
created_at: '2026-05-05T13:26:14Z'
updated_at: '2026-11-18T06:50:19Z'
priority: 100
featured: false
language: en
tags: []
permalink: "/decsion/support/2026/05/05/project-ai-decision-support-for-personalized-brain-health-risk-profiling/"
institutes:
- name: ARTORG Center for Biomedical Engineering Research, University of Bern, Gerontechnology
    and Rehabilitation Group
  url: https://www.artorg.unibe.ch/research/ger/index_eng.html
contact:
  name: Dr. Vassilis Skaramagkas
  email: vasileios.skaramagkas@unibe.ch
workload:
- activity: Data analysis and validation
  percentage: 25
- activity: Development of the AI model/prototype
  percentage: 50
- activity: Literature review
  percentage: 25
submission_email: bme.artorg@unibe.ch
attachments: []
---
## Background

Dementia prevention is becoming an urgent public health priority, particularly as a substantial proportion of dementia risk is associated with modifiable lifestyle and health factors. The Swiss BrAInHealth project aims to reduce individual dementia risk by combining clinical expertise, digital biomarkers, and artificial intelligence. In this context, the Augmented Intelligence Platform for Brain Health is designed to support clinicians by integrating heterogeneous patient data, including clinical assessments, cognitive information, lifestyle data, and sensor-derived digital biomarkers. 

Clinical decision support systems based on artificial intelligence have the potential to improve the interpretation of complex multimodal health data and provide actionable recommendations for healthcare professionals. However, AI tools in clinical settings must be transparent, interpretable, reliable, and aligned with clinical workflows. In brain health and dementia prevention, decision support systems should not replace clinicians but rather augment their expertise by summarizing patient-specific risk profiles and highlighting modifiable risk factors such as physical inactivity, sleep problems, cardiovascular risk, or depressive symptoms.

## Aim

The aim of this thesis is to design and prototype an AI-supported decision support module for personalized brain health risk profiling in individuals with subjective cognitive complaints. The system should integrate selected clinical and digital biomarker inputs and generate interpretable outputs that could support clinicians in identifying relevant risk factors and potential intervention targets.

## Materials and Methods

The student will begin with a literature review on AI-based clinical decision support systems, with a specific focus on explainable AI, risk prediction, and decision support in dementia prevention, cognitive decline, and personalized medicine. Based on this review, the student will define requirements for a prototype decision support module suitable for the Swiss BrAInHealth context.

The practical work will include preprocessing and analysis of available or simulated multimodal patient data, including clinical variables and selected digital biomarkers. The student will develop and compare machine learning models for risk stratification or patient profiling, such as logistic regression, random forests, gradient boosting, or interpretable neural network approaches. Explainability methods such as SHAP values, feature importance analysis, or rule-based summaries may be used to make model outputs understandable for clinicians. Depending on data availability, the system may be evaluated using retrospective or pilot data from the Brain Health Clinic or synthetic test datasets reflecting the expected project structure. The final output should include a working prototype or analytical pipeline that demonstrates how AI could support patient-specific risk factor analysis and decision-making.

## Requirements

- Good programming skills in python
- Interest in biomedical AI and clinical decision support systems
- Basic knowledge of machine learning and data analysis
- Interest in explainable AI and human-centered medical AI
