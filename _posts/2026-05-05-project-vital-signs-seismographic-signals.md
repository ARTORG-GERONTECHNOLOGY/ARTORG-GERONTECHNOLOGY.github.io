---
layout: post
title: Extracting Vital Sings from Seismic Signals
date: 2026-05-05 09:00:00
summary: Project Proposal
categories:
- sleep-analysis
status: taken
schema_version: 1
template_version: 1
proposal_id: ger-vital-signs-seismographic-signals
created_at: '2025-04-30T12:57:12Z'
updated_at: '2026-11-18T13:23:10Z'
priority: 100
featured: false
language: en
tags: []
permalink: "/sleep-analysis/2026/05/05/project-vital-signs-seismographic-signals/"
supervisors:
- name: Prof. Dr. Tobias Nef
- name: Noora Angelva, MSc
institutes:
- name: ARTORG Center for Biomedical Engineering Research, University of Bern, Gerontechnology
    and Rehabilitation Group
  url: https://www.artorg.unibe.ch/research/ger/index_eng.html
contact:
  name: Noora Angelva, MSc
  email: noora.angelva@unibe.ch
workload:
- activity: Development of the algorithms
  percentage: 60
- activity: Data analysis
  percentage: 30
- activity: Data collection
  percentage: 10
submission_email: bme.artorg@unibe.ch
attachments: []
---
## Background

Sleep monitoring is a crucial aspect of health tracking, significantly aiding in assessing a person’s overall well-being. Traditional monitorization methods utilize respiratory tracking through uncomfortable breathing devices and heartbeat rate (HR) measurement via body-contact wearables like chest straps and wrist sensors. These methods often cause discomfort or are neglected at bedtime due to their intrusive nature, particularly among older adults or patients. Innovatively, biomedical vibration signals, such as seismocardiogram (SCG) and ballistocardiogram (BCG), which measure micro-vibrations produced by the heart movement, are analysed for human health assessment and monitoring. SCG, capturing the micro-vibrations from heart movements, has been used to implement user authentication on mobile phones by analysing heartbeat-induced chest vibrations. Understanding and analysing vital parameters like heart rate and respiration are essential for monitoring cardiac health and diagnosing heart-related diseases. As a result, a variety of wearable healthcare devices have been developed for continuous electrocardiogram (ECG) monitoring, catering to both patients and health-conscious individuals. Despite their benefits, the need for constant body attachment makes these devices cumbersome, particularly during sleep, highlighting the demand for less obtrusive, more user-friendly monitoring technologies. There is, therefore, a need for non-intrusive solutions that continuously monitor cardiac events during night periods.

## Aim

Development of algorithm(s) to extract sleep-related activities such as heart rate, respiration rate, and activity pattern (e.g., leg movements) in bed from seismic signals of individuals lying on a bed. Additionally, if the student shows interest, the algorithms may be extended to estimate sleep positions and basic sleep parameters.

## Materials and Methods

The student will begin with a literature review on algorithmic methods to derive HR, RR, and motion from seismic signals. Building on this, they will implement and test algorithms capable of extracting the parameters of interest. Data will be provided and collected from an ongoing study, where seismic signals are recorded simultaneously with reference systems (e.g., ECG and commercial sleep monitoring devices). This will allow evaluation of algorithm performance by comparing extracted parameters against ground truth. Depending on interest, additional algorithm development may explore multi-sensor fusion, advanced signal decomposition, or machine learning–based classification approaches for sleep staging or posture recognition.

## Requirements

- Good programming skills
- Good knowledge of signal processing
- Basic knowledge of data analysis
