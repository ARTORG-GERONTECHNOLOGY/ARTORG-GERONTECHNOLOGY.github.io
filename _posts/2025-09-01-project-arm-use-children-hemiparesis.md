---
layout: post
title: Quantification of Daily Arm Use from IMU Data in Children with Hemiparesis
date: 2025-09-01 09:00:00
summary: Project Proposal
categories:
- upper-limb-analysis
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
proposal_id: ger-arm-use-children-hemiparesis
permalink: "/post_archive/2025-09-01-project-arm-use-children-hemiparesis/"
created_at: '2025-09-01T09:56:16Z'
updated_at: '2026-11-11T16:28:39Z'
contact:
  name: Kevin Möri
  email: kevin.moeri@unibe.ch
  address: Freiburgstrasse 3, CH-3010 Bern
supervisors:
- name: Kim Svenja Lory
- name: Kevin Möri
- name: Prof. Dr. Tobias Nef
institutes:
- name: Division of Neuropediatrics, Development and Rehabilitation, University Children's
    Hospital Bern
- name: Gerontechnology and Rehabilitation Group, ARTORG Center for Biomedical Engineering
    Research, University of Bern
  url: https://www.artorg.unibe.ch/research/ger/index_eng.html
workload:
- activity: Development of algorithms
  percentage: 60
- activity: Data analysis
  percentage: 40
---
## Background

Children with hemiparesis show sensory and motor deficits, which negatively affect activities of daily living and thus, their quality of live. Having to overcome these barriers on a daily basis makes it difficult for affected children to actively participate in activities with their peers. This may further have a negative impact on social and psychological aspects. A study of the Bern University Children’s Hospital (Inselspital) investigates the effects and mechanisms of sensory afferent electrostimulation with the goal to improve upper limb function in children with spastic hemiparesis. To evaluate the daily arm use at different stages during the study, two inertial measurement units ([IMUs](https://axivity.com/product/ax6)) are worn by the participants at home for periods of 24 hours. There are a total of four recordings per participant: 1) Baseline recording, 2) Training evaluation recording, 3) Treatment evaluation recording, 4) Follow-up recording.

## Aim

Development of a robust algorithm to quantify daily arm use from IMU data captured at different timepoints in a clinical trial with a follow-up examination.

## Materials and Methods

This thesis consist of two parts. The first part focuses on developing a robust algorithm to preprocess the underlying data and to extract and classify movement activities. This requires the student to 1) research and get familiar with the neurological condition of the participant group as well as commonly used algorithms for quantifying activities from arm swing using IMUs, 2) evaluate the applicability of existing algorithms and add your own ideas to suit the given task, and 3) implement and test the evaluated methods.
The second part of this project aims to investigate differences of arm use between the impaired and the healthy arm as well as the performance changes between the different study stages. The developed algorithm and corresponding findings are expected to be documented in form of a written thesis document.

## Requirements

- Good programming skills in python
- Good knowledge in time series analysis
- Good knowledge in statistics
