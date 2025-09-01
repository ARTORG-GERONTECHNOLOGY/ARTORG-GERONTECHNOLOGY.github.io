---
layout: post
title: Gait Analysis via Wrist-Worn Accelerometers
date: 2025-09-01 09:00:00
summary: Project Proposal
categories: gait-analysis
---

### Background:

Gait is an important biomarker for neurodegenerative diseases (e.g., Parkinson’s disease, Alzheimer’s disease). Since most consumer and research wearables contain accelerometers and large datasets are available, developing robust methods that work across settings (indoor/outdoor) could enable scalable gait monitoring. Walking indoors and outdoors represents different neurological aspects. Outdoor walking, typically involving longer and more continuous strides, reflects core gait mechanics, whereas indoor walking often includes dual- or even triple-task elements, requiring complex neurological networks to work in tandem. Deep learning (DL) models for predicting spatiotemporal gait parameters are a relatively new development (Brand et al., 2024, 2025; Yuan et al., 2024). Many questions, such as model performance in different settings (e.g., indoor vs. outdoor), incorporating a biomechanical model, or including demographic information to improve prediction, remain unanswered.

### Aim:

This thesis aims to develop and validate methods for predicting spatiotemporal gait parameters from wrist accelerometers by combining classical signal processing with DL models, trained with foundation models. The study will investigate whether these daily-life trained models generalize to indoor and outdoor settings, and whether performance can be improved by training separate models for each condition. The influence of demographic variables (sex, height, weight) on prediction accuracy will also be assessed.

### Material and Methods:

The project will draw on existing large wrist accelerometer datasets, complemented by a small custom dataset collected indoors and outdoors for validation. After preprocessing and feature extraction, hybrid models will be trained using both signal-based features and AI-based time-series representations. Comparisons will be made between general and condition-specific models, with and without demographic variables, and evaluated against reference gait measures using standard performance metrics.

### Nature of the Thesis:

Method development (signal processing algorithms, machine learning models): 60%  
Data collection and analysis (acquisition, preprocessing, evaluation): 40%

### Requirements:

Strong programming skills in Python  
Experience with Numpy, Pandas/Polars, PyTorch  
Familiarity with wearable sensor data and time-series analysis is advantageous  
Basic knowledge of statistics

### Supervisors:

Dr. Michael Single  
Aaron Colombo, MSc

### Institute:

[Gerontechnology and Rehabilitation Group](https://www.artorg.unibe.ch/research/ger/index_eng.html), ARTORG Center for Biomedical Engineering Research, University of Bern

### Start Date:

October 2025 or upon agreement.

### Workplace:

ARTORG Center (SITEM, Freiburgstrasse 3) on the Insel hospital campus.

### Contact:

Apply for this project by sending your CV, course transcripts, and a short motivation letter (max. ¾ A4 page) to [aaron.colombo@unibe.ch](mailto:aaron.colombo@unibe.ch) with "MT Gait Wrist - Firstname Lastname" as the subject.

___

### References:

Brand, Y. E., Buchman, A. S., Kluge, F., Palmerini, L., Becker, C., Cereatti, A., Maetzler, W., Vereijken, B., Yarnall, A. J., Rochester, L., Din, S. D., Mueller, A., Hausdorff, J. M., & Perlman, O. (2025). Continuous Assessment of Daily-Living Gait Using Self-Supervised Learning of Wrist-Worn Accelerometer Data (p. 2025.05.21.25328061). medRxiv. [https://doi.org/10.1101/2025.05.21.25328061](https://doi.org/10.1101/2025.05.21.25328061)

Brand, Y. E., Kluge, F., Palmerini, L., Paraschiv-Ionescu, A., Becker, C., Cereatti, A., Maetzler, W., Sharrack, B., Vereijken, B., Yarnall, A. J., Rochester, L., Del Din, S., Muller, A., Buchman, A. S., Hausdorff, J. M., & Perlman, O. (2024). Self-supervised learning of wrist-worn daily living accelerometer data improves the automated detection of gait in older adults. Scientific Reports, 14(1), 20854. [https://doi.org/10.1038/s41598-024-71491-3](https://doi.org/10.1038/s41598-024-71491-3)

Yuan, H., Chan, S., Creagh, A. P., Tong, C., Acquah, A., Clifton, D. A., & Doherty, A. (2024). Self-supervised learning for human activity recognition using 700,000 person-days of wearable data. Npj Digital Medicine, 7(1), 1–10. [https://doi.org/10.1038/s41746-024-01062-3](https://doi.org/10.1038/s41746-024-01062-3)

