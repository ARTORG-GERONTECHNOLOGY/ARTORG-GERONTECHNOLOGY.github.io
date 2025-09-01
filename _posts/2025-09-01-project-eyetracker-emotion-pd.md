---
layout: post
title: Analysis of Emotion-Related Pupillometry/Eyetracking in Parkinson’s Disease
date: 2025-09-01 09:00:00
summary: Project Proposal
categories: parkinson
---

### Background:

Parkinson’s disease (PD) is not only characterized by motor symptoms but also by non-motor symptoms such as depression, anxiety, apathy, and impulse control disorders, which may affect emotion processing (Weintraub & Mamikonyan, 2019). Deficits in recognizing negative emotions such as anger, disgust, fear, and sadness are frequently reported in PD (Argaud et al., 2018). Pupillometry is a promising marker for emotion processing, but raw pupil data are noisy and require careful preprocessing. Advanced statistical models, such as linear mixed models (LMM) and generalized additive mixed models (GAMM), provide a framework to capture both inter- and intra-individual variability, as well as non-linear trajectories over time, which have not yet been fully exploited in this context.


### Aim:

The aim of this thesis is to establish a high-quality, cleaned dataset of pupillometry responses and gaze location from PD patients during an emotional picture-rating task. Using advanced statistical models, you will investigate whether pupillary responses differ across pleasant, unpleasant, and neutral stimuli, and how they are modulated by clinical measures such as depression, anxiety, apathy, or impulse control disorders. In a sub-cohort, you will investigate the effect of deep brain stimulation (before/after surgery) on pupillometry and gaze during the task.


### Material and Methods:

You will start from the raw pupillometry recordings acquired during the International Affective Picture System (IAPS) task in PD patients treated with subthalamic nucleus deep brain stimulation (STN-DBS). The first stage will involve the development of a rigorous preprocessing pipeline, including blink detection, interpolation, baseline correction/normalization, resulting in a cleaned dataset. You will start exploring the data with visual plotting and basic statistics. Furthermore, you will apply advanced statistical modeling LMMs to account for repeated measures and nested data structures, and GAMM to model potential non-linear pupil dynamics across time. Predictors will include stimulus category (pleasant, unpleasant, neutral), or ratings, while controlling for measures of neuropsychiatric symptoms (HADS, QUIP-RS, Starkstein Apathy Scale, MoCA).


### Nature of the Thesis:

Data preprocessing & dataset construction: 50%  
Statistical modelling & interpretation: 50%


### Requirements:

Good programming and data analysis skills in Python and/or R  
Familiarity with time-series data  
Experience with statistical methods (LMM/GAMM) will be an advantage (but is not necessary)  
Interest in neuroscience and clinical research


### Supervisors:

Prof. Dr. Tobias Nef  
Dr. Deborah Amstutz  
Matilde Castelli, MSc and Aaron Colombo, MSc

### Institute:

[Gerontechnology and Rehabilitation Group](https://www.artorg.unibe.ch/research/ger/index_eng.html), ARTORG Center for Biomedical Engineering Research, University of Bern  
[Center for Parkinson’s and Movement Disorder](https://neurologie.insel.ch/de/unser-angebot/zentrum-fuer-parkinson-und-bewegungsstoerungen), Department of Neurology, Bern University Hospital and University of Bern


### Start Date:

September 2025 or upon agreement.

### Workplace:

ARTORG Center (SITEM, Freiburgstrasse 3) on the Insel hospital campus.

### Contact:

Apply for this project by sending your CV, course transcripts, and a short motivation letter (max. ¾ A4 page) to [aaron.colombo@unibe.ch](mailto:aaron.colombo@unibe.ch) with "MT Eye Emotion PD - Firstname Lastname" as the subject.

___

### References:

Argaud, S., Vérin, M., Sauleau, P., & Grandjean, D. (2018). Facial emotion recognition in Parkinson’s disease: A review and new hypotheses. Movement Disorders, 33(4), 554–567. [https://doi.org/10.1002/mds.27305](https://doi.org/10.1002/mds.27305)

Weintraub, D., & Mamikonyan, E. (2019). The Neuropsychiatry of Parkinson Disease: A Perfect Storm. The American Journal of Geriatric Psychiatry, 27(9), 998–1018. [https://doi.org/10.1016/j.jagp.2019.03.002](https://doi.org/10.1016/j.jagp.2019.03.002)
