---
layout: post
title: Gait Analysis from Seismographic Measurements on Healthy Individuals
date: 2025-04-28 12:00:00
summary: Project Proposal
categories: gait-analysis
---

### Background

Analyzing changes in gait parameters longitudinally is a reliable approach to detect age-related and neurodegenerative conditions. However, traditional observation-based assessmentsmany and many existing sensor systems are oftentimes affected subjectivity, high costs, limited spatial coverage, privacy concerns, or a poor long-term user compliance. Seismographs offers a promising, contact-free alternative that measure floor vibrations to quantify gait parameters objectively, economically, and with minimal burden on the user [[1]](https://www.nature.com/articles/s41598-024-64508-4).

### Aim of the Project

Extend an existing framework that uses seismographic measurements to perform a gait analysis of walking individuals in different environments. Conduct a statistical analysis between the developed approach and a reference system.

#### Subtasks (not all of these have to be fulfilled):

+ Rework the spatial localization algorithm
+ Calculate force fields from the measured vibrations (those that were induced by the performed steps)
+ Increase the strength of the existing morphologocal filter
+ Implement an stable person identifier by calculating a signature of the measured signals' spectrum (can also be used using deep learning techniques).
+ Counteract the damping effects by implementing dampling models.

###  Material and Methods

+ Basic algorithmic implementation to calculate spatio-temporal gait parameters [[1]](https://www.nature.com/articles/s41598-024-64508-4).
+ Custom-built sensor device that can be used to perform seismic measurements (2000 Hz).
+ Reference system that can be used for the comparision.

### Requirements
- Good programming skills
- Advanced knowledge of signal analysis
- Basic knowledge of machine learning

### Contact
[Michael Single, PhD](mailto:michael.single@unibe.ch)


