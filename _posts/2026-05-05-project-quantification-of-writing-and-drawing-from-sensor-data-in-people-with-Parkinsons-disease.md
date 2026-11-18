---
layout: post
title: Quantification of writing and drawing from sensor data in people with Parkinson’s
  disease
date: 2026-05-05 12:00:00
summary: Project Proposal
categories:
- sensor-tracking
status: archived
supervisors:
- name: Kevin Möri, MSc
schema_version: 1
template_version: 1
proposal_id: ger-quantification-of-writing-and-drawing-from-sensor-data-in-people-with-parkinsons-disease
created_at: '2026-05-05T13:26:14Z'
updated_at: '2026-11-18T13:23:10Z'
priority: 100
featured: false
language: en
tags: []
permalink: "/sensor-tracking/2026/05/05/project-quantification-of-writing-and-drawing-from-sensor-data-in-people-with-Parkinsons-disease/"
institutes:
- name: ARTORG Center for Biomedical Engineering Research, University of Bern, Gerontechnology
    and Rehabilitation Group
  url: https://www.artorg.unibe.ch/research/ger/index_eng.html
contact:
  name: Kevin Möri, MSc
  email: kevin.moeri@unibe.ch
workload:
- activity: Development of algorithms
  percentage: 60
- activity: Data analysis
  percentage: 40
submission_email: bme.artorg@unibe.ch
attachments: []
---
## Background

Parkinson’s disease (PD) is a progressive neurodegenerative disorder primarily affecting the basal ganglia and characterized by both motor symptoms and non-motor symptoms. Clinical diagnosis is based on assessment of characteristic motor features using the MDS-UPDRS as the gold standard for evaluating PD severity, yet it relies on subjective scoring and lacks detailed kinematic information.
To address this limitation, research has explored objective movement assessment using handwriting and drawing tasks. Key kinematic variables include movement size, duration, velocity, fluency, and force application. Drawing tasks are valuable because they emphasize sensorimotor control while minimizing linguistic demands. Augmented Reality (AR) has also emerged as a potential tool for motor assessment, though most research has focused on gait rather than upper limb function.
To evaluate hand use during the study a smart stylus within an AR environment will be used, with integrated accelerometer and gyroscope. Participants perform writing and drawing tasks while movement metrics are recorded and compared between PD patients and healthy controls.

## Aim

Development of a robust algorithm to quantify writing and drawing from accelerometer and gyroscope data captured at one specific timepoint in an exploratory clinical trial.

## Materials and Methods

This thesis consist of two parts. The first part focuses on developing a robust algorithm to preprocess the underlying data. This requires the student to 1) research and get familiar with the neurological condition of the participant group as well as commonly used algorithms for quantifying activities from hand use using the smart stylus 2) evaluate the applicability of existing algorithms and add your own ideas to suit the given task, and 3) implement and test the evaluated methods. The second part of this project aims to investigate differences of hand use between PD patients and healthy controls. The developed algorithm and corresponding findings are expected to be documented in form of a written thesis document.

## Requirements

- Good programming skills in python
- Good knowledge in time series analysis
- Good knowledge in statistics
