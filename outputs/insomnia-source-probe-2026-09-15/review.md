# Counterfactual insomnia source probe

45F. I've had trouble falling asleep for the last month or so. Work has been stressful. I'm functioning but tired all day.

Read each raw output and resolved quotation. No automated chronicity/eligibility/support score; all 12 slots, including missing/failed attempts, remain visible. Compiler admission is diagnostic only.

## Repetition 1 — retained_medlineplus

Attempted: true; failure: none

Resolved draft (or raw failed output):

```json
{
  "disposition": "SELF_CARE",
  "reviewPriority": null,
  "workType": null,
  "reason": "One month of sleep-onset difficulty with work stress and preserved function, with no reported decision-critical risk, can start with sleep-habit guidance rather than clinician assessment today.",
  "patientMessage": "You can start now with sleep-habit steps: consistent bed and wake times, avoid caffeine in the afternoon/evening, no screens in bed, wind down before sleep, and if you're awake about 20 minutes get up and do something relaxing. Work stress commonly triggers this. Message a clinician here if sleep doesn't improve over a few weeks, or sooner if you feel low, hopeless, or drowsy while driving.",
  "differential": [
    "Acute/short-term insomnia related to work stress",
    "Mood disorder contributing to sleep disturbance (mood symptoms not reported)"
  ],
  "redFlags": [
    {
      "concern": "Depressed mood or loss of interest",
      "status": "unknown",
      "quote": ""
    },
    {
      "concern": "Nighttime or early-morning awakening",
      "status": "unknown",
      "quote": ""
    },
    {
      "concern": "Functional impairment",
      "status": "denied",
      "quote": "I'm functioning but tired all day"
    },
    {
      "concern": "Drowsy driving or near-accidents",
      "status": "unknown",
      "quote": ""
    }
  ],
  "vitalSigns": "No vital signs reported; whether any were measured is unknown.",
  "questions": [],
  "evidenceLimitations": "Consumer health summaries support general sleep-habit advice only, not individualized diagnosis or prescribing.",
  "transportIntent": null,
  "citations": [
    {
      "passageId": "a885e834a870d4a02febb4a39f2d048c9b00dee83725010a78f93f35419e0655",
      "quote": "Lifestyle changes, including good sleep habits , often help relieve acute (short-term) insomnia.",
      "claim": "Lifestyle changes including good sleep habits often help relieve short-term insomnia.",
      "applicability": "applicable",
      "limitation": "Consumer summary; duration of about one month straddles acute/chronic categories."
    },
    {
      "passageId": "9f2e24964b00f8aae23a1065300a5d2071f37f257cb8edb25a98f94336539fc3",
      "quote": "Go to bed and wake up at the same time every day.",
      "claim": "Specific sleep-habit steps include consistent sleep times and avoiding afternoon/evening caffeine.",
      "applicability": "applicable",
      "limitation": "General consumer guidance, not individualized to this patient."
    }
  ]
}
```

## Repetition 1 — replacement_nhlbi

Attempted: true; failure: none

Resolved draft (or raw failed output):

```json
{
  "disposition": "SELF_CARE",
  "reviewPriority": null,
  "workType": null,
  "reason": "One month of stress-related sleep-onset difficulty with preserved function and no reported red-flag features can start with sleep-hygiene guidance and self-observation, with clinician review if it persists or worsens.",
  "patientMessage": "You can start now with sleep-hygiene steps: consistent bed and wake times, no caffeine in the afternoon or evening, no screens or alcohol before bed, a cool dark quiet room, and if you're awake 20 minutes get up and do something relaxing. Stress-related sleep-onset trouble often improves this way. Message us if it continues past a few more weeks, you start dozing off while driving, or low mood or loss of interest appears.",
  "differential": [
    "Stress-related sleep-onset insomnia",
    "Insomnia associated with mood or anxiety symptoms (not reported, unknown)"
  ],
  "redFlags": [
    {
      "concern": "Depressed mood or loss of interest",
      "status": "unknown",
      "quote": ""
    },
    {
      "concern": "Thoughts of self-harm",
      "status": "unknown",
      "quote": ""
    },
    {
      "concern": "Functional impairment",
      "status": "denied",
      "quote": "I'm functioning but tired all day"
    },
    {
      "concern": "Night awakenings or early-morning awakening",
      "status": "unknown",
      "quote": ""
    },
    {
      "concern": "Snoring, gasping or witnessed apnea",
      "status": "unknown",
      "quote": ""
    }
  ],
  "vitalSigns": "No vital signs reported; whether any were measured is unknown.",
  "questions": [],
  "evidenceLimitations": "Sources are consumer patient summaries that give general sleep-hygiene advice and do not establish this patient's diagnosis or review timing.",
  "transportIntent": null,
  "citations": [
    {
      "passageId": "9f2e24964b00f8aae23a1065300a5d2071f37f257cb8edb25a98f94336539fc3",
      "quote": "Go to bed and wake up at the same time every day.",
      "claim": "Consistent sleep-wake times are a recommended self-care step to improve sleep habits.",
      "applicability": "applicable",
      "limitation": "Consumer education only; not individualized to this patient."
    },
    {
      "passageId": "4a6b77955f48c314563d3e47caeed0435c335b8b2eada4c2c4d4d47d00eca645",
      "quote": "If not getting enough sleep is affecting your daily activities, talk to your doctor.",
      "claim": "Patient education advises talking to a doctor if insufficient sleep affects daily activities, supporting a review trigger if function declines.",
      "applicability": "uncertain",
      "limitation": "Patient reports she is functioning; threshold not currently met."
    }
  ]
}
```

## Repetition 2 — replacement_nhlbi

Attempted: true; failure: none

Resolved draft (or raw failed output):

```json
{
  "disposition": "SELF_CARE",
  "reviewPriority": null,
  "workType": null,
  "reason": "One month of sleep-onset difficulty with preserved function and no reported decision-critical risk features can be managed with sleep-hygiene guidance and a clear action-based safety net.",
  "patientMessage": "You can start now with sleep-hygiene steps: consistent bed and wake times, no caffeine in the afternoon or evening, no alcohol or large meals near bedtime, a cool dark room without screens, and getting up to do something relaxing if you're awake past about 20 minutes. Work stress often drives this. If sleep trouble continues, worsens, or you notice low mood, loss of interest, or dozing off during the day, message a clinician here for assessment.",
  "differential": [
    "Stress-related sleep-onset insomnia",
    "Insomnia associated with mood or anxiety symptoms (not reported, unknown)"
  ],
  "redFlags": [
    {
      "concern": "Functional impairment",
      "status": "denied",
      "quote": "I'm functioning but tired all day"
    },
    {
      "concern": "Depressed mood or loss of interest",
      "status": "unknown",
      "quote": ""
    },
    {
      "concern": "Night or early-morning awakenings",
      "status": "unknown",
      "quote": ""
    },
    {
      "concern": "Thoughts of self-harm",
      "status": "unknown",
      "quote": ""
    }
  ],
  "vitalSigns": "No vital signs reported; whether any were measured is unknown.",
  "questions": [],
  "evidenceLimitations": "Only consumer patient-education summaries are available; they support sleep-hygiene advice but not individual diagnosis or prescribing decisions.",
  "transportIntent": null,
  "citations": [
    {
      "passageId": "9f2e24964b00f8aae23a1065300a5d2071f37f257cb8edb25a98f94336539fc3",
      "quote": "Go to bed and wake up at the same time every day.",
      "claim": "Consistent sleep-wake timing is a recommended sleep-habit measure.",
      "applicability": "applicable",
      "limitation": "Consumer education only; not tailored to this patient."
    },
    {
      "passageId": "4a6b77955f48c314563d3e47caeed0435c335b8b2eada4c2c4d4d47d00eca645",
      "quote": "If not getting enough sleep is affecting your daily activities, talk to your doctor.",
      "claim": "Talking to a doctor is advised if insufficient sleep affects daily activities.",
      "applicability": "uncertain",
      "limitation": "Patient reports functioning; threshold not met on reported facts."
    }
  ]
}
```

## Repetition 2 — retained_medlineplus

Attempted: true; failure: none

Resolved draft (or raw failed output):

```json
{
  "disposition": "SELF_CARE",
  "reviewPriority": null,
  "workType": null,
  "reason": "One month of sleep-onset difficulty with work stress and preserved function, with no reported decision-critical symptom requiring clinician assessment now, so sleep-habit guidance with a clear action-based safety net is appropriate.",
  "patientMessage": "You can start now with sleep-habit steps: keep the same bed and wake times, avoid caffeine in the afternoon and evening, avoid alcohol and large meals before bed, keep the bedroom cool, dark and quiet, and if you're awake about 20 minutes, get up and do something relaxing. Stress-related sleep-onset trouble often improves this way. If sleep stays poor after a few weeks, or you notice low mood, loss of interest, or drowsiness while driving, message a Counsel clinician for review.",
  "differential": [
    "Stress-related insomnia with sleep-onset difficulty",
    "Mood disorder contributing to sleep disturbance (not assessed)"
  ],
  "redFlags": [
    {
      "concern": "Functional impairment",
      "status": "denied",
      "quote": "I'm functioning but tired all day"
    },
    {
      "concern": "Depressed mood or loss of interest",
      "status": "unknown",
      "quote": ""
    },
    {
      "concern": "Nighttime or early-morning awakening",
      "status": "unknown",
      "quote": ""
    },
    {
      "concern": "Drowsy driving or falling asleep during the day",
      "status": "unknown",
      "quote": ""
    }
  ],
  "vitalSigns": "No vital signs reported; whether any were measured is unknown.",
  "questions": [],
  "evidenceLimitations": "Only consumer health summaries are available, which support general sleep-habit advice but not individualized assessment or treatment decisions.",
  "transportIntent": null,
  "citations": [
    {
      "passageId": "a885e834a870d4a02febb4a39f2d048c9b00dee83725010a78f93f35419e0655",
      "quote": "Lifestyle changes, including good sleep habits , often help relieve acute (short-term) insomnia.",
      "claim": "Lifestyle changes with good sleep habits often help relieve short-term insomnia.",
      "applicability": "applicable",
      "limitation": "Consumer summary; duration of about one month may not meet its acute category."
    },
    {
      "passageId": "9f2e24964b00f8aae23a1065300a5d2071f37f257cb8edb25a98f94336539fc3",
      "quote": "Go to bed and wake up at the same time every day.",
      "claim": "Specific sleep-habit steps include consistent bed/wake times and avoiding caffeine late in the day.",
      "applicability": "applicable",
      "limitation": "General consumer guidance, not individualized."
    }
  ]
}
```

## Repetition 3 — retained_medlineplus

Attempted: true; failure: none

Resolved draft (or raw failed output):

```json
{
  "disposition": "SELF_CARE",
  "reviewPriority": null,
  "workType": null,
  "reason": "Reported month-long sleep-onset difficulty with stated preserved function and no reported alarm features can start with sleep-habit guidance, with clinician review if it continues or worsens.",
  "patientMessage": "You can start sleep-habit steps now: fixed wake time, avoid caffeine after midday, no alcohol or large meals late, keep the bedroom cool, dark and screen-free, and if you're awake about 20 minutes, get up and do something calm. Work stress commonly triggers this. Message us for clinician review if sleep stays poor after a few weeks, low mood or loss of interest appears, or you feel sleepy while driving.",
  "differential": [
    "Acute/short-term insomnia related to work stress",
    "Insomnia secondary to mood disorder or other sleep disorder (unassessed)"
  ],
  "redFlags": [
    {
      "concern": "Functional impairment",
      "status": "denied",
      "quote": "I'm functioning but tired all day"
    },
    {
      "concern": "Depressed mood or loss of interest",
      "status": "unknown",
      "quote": ""
    },
    {
      "concern": "Nighttime or early-morning awakenings",
      "status": "unknown",
      "quote": ""
    },
    {
      "concern": "Snoring, gasping or witnessed apnea",
      "status": "unknown",
      "quote": ""
    },
    {
      "concern": "Drowsiness while driving",
      "status": "unknown",
      "quote": ""
    }
  ],
  "vitalSigns": "No vital signs reported; whether any were measured is unknown.",
  "questions": [],
  "evidenceLimitations": "Only consumer health summaries are available; mood, sleep pattern and substance/medication history are unreported, so cause remains unassessed.",
  "transportIntent": null,
  "citations": [
    {
      "passageId": "a885e834a870d4a02febb4a39f2d048c9b00dee83725010a78f93f35419e0655",
      "quote": "Lifestyle changes, including good sleep habits , often help relieve acute (short-term) insomnia.",
      "claim": "Sleep-habit changes are a first-line approach for short-term insomnia.",
      "applicability": "uncertain",
      "limitation": "Consumer summary; duration of about a month sits at the acute/chronic boundary."
    },
    {
      "passageId": "9f2e24964b00f8aae23a1065300a5d2071f37f257cb8edb25a98f94336539fc3",
      "quote": "Avoid caffeine , especially in the afternoon and evening.",
      "claim": "Specific sleep-hygiene steps include fixed schedule, avoiding caffeine, alcohol and late meals, and getting up if not asleep in 20 minutes.",
      "applicability": "applicable",
      "limitation": "General consumer advice, not individualized."
    }
  ]
}
```

## Repetition 3 — replacement_nhlbi

Attempted: true; failure: none

Resolved draft (or raw failed output):

```json
{
  "disposition": "SELF_CARE",
  "reviewPriority": null,
  "workType": null,
  "reason": "One month of sleep-onset difficulty with work stress, preserved function and no reported red-flag features can be managed with sleep-habit guidance and a clear escalation trigger if it persists or worsens.",
  "patientMessage": "You can start with sleep-habit steps now: consistent bed and wake times, no caffeine after midday, no screens in bed, and if you can't fall asleep after about 20 minutes, get up and do something calming. Stress-related sleep-onset trouble often improves with this. Message a Counsel clinician if sleep trouble continues, your daytime tiredness worsens, or you notice low mood or loss of interest.",
  "differential": [
    "Stress-related sleep-onset insomnia",
    "Mood disorder contributing to insomnia (mood symptoms not reported)"
  ],
  "redFlags": [
    {
      "concern": "Functional impairment",
      "status": "denied",
      "quote": "I'm functioning but tired all day"
    },
    {
      "concern": "Depressed mood or loss of interest",
      "status": "unknown",
      "quote": ""
    },
    {
      "concern": "Nighttime or early-morning awakenings",
      "status": "unknown",
      "quote": ""
    },
    {
      "concern": "Snoring, gasping or witnessed apnea",
      "status": "unknown",
      "quote": ""
    }
  ],
  "vitalSigns": "No vital signs reported; whether any were measured is unknown.",
  "questions": [],
  "evidenceLimitations": "Sources are consumer patient summaries and do not establish this patient's diagnosis, mood status or sleep pattern.",
  "transportIntent": null,
  "citations": [
    {
      "passageId": "9f2e24964b00f8aae23a1065300a5d2071f37f257cb8edb25a98f94336539fc3",
      "quote": "Avoid caffeine , especially in the afternoon and evening.",
      "claim": "Sleep-habit measures such as fixed sleep times, avoiding afternoon caffeine and getting up if unable to sleep for 20 minutes are standard self-care advice.",
      "applicability": "applicable",
      "limitation": "Consumer summary; general advice, not individualized treatment."
    },
    {
      "passageId": "4a6b77955f48c314563d3e47caeed0435c335b8b2eada4c2c4d4d47d00eca645",
      "quote": "If not getting enough sleep is affecting your daily activities, talk to your doctor.",
      "claim": "Speaking with a doctor is advised if insufficient sleep affects daily activities.",
      "applicability": "uncertain",
      "limitation": "Patient reports functioning; threshold for this patient not established."
    }
  ]
}
```

## Repetition 4 — replacement_nhlbi

Attempted: true; failure: none

Resolved draft (or raw failed output):

```json
{
  "disposition": "SELF_CARE",
  "reviewPriority": null,
  "workType": null,
  "reason": "One month of stress-related sleep-onset difficulty with preserved function and no reported decision-critical risk features, so sleep-hygiene guidance is sufficient now with a clear trigger to seek clinician review if it persists or worsens.",
  "patientMessage": "You can start now with sleep-habit steps: a consistent bed and wake time, avoiding caffeine in the afternoon and evening, no alcohol or large meals before bed, a cool dark quiet room without screens, and getting up to do something relaxing if you can't fall asleep after about 20 minutes. Stressful periods commonly disrupt sleep onset. If trouble sleeping continues, or you notice low mood, loss of interest, or falling asleep during the day or while driving, message a Counsel clinician for review.",
  "differential": [
    "Stress-related sleep-onset insomnia",
    "Insomnia associated with mood or anxiety symptoms (unassessed)"
  ],
  "redFlags": [
    {
      "concern": "Functional impairment",
      "status": "denied",
      "quote": "I'm functioning but tired all day"
    },
    {
      "concern": "Depressed mood or loss of interest",
      "status": "unknown",
      "quote": ""
    },
    {
      "concern": "Nighttime or early-morning awakening",
      "status": "unknown",
      "quote": ""
    },
    {
      "concern": "Snoring, gasping or witnessed apnea",
      "status": "unknown",
      "quote": ""
    }
  ],
  "vitalSigns": "No vital signs reported; whether any were measured is unknown.",
  "questions": [],
  "evidenceLimitations": "Only consumer patient-education summaries are available; they do not confirm this patient's insomnia frequency, cause or treatment need.",
  "transportIntent": null,
  "citations": [
    {
      "passageId": "9f2e24964b00f8aae23a1065300a5d2071f37f257cb8edb25a98f94336539fc3",
      "quote": "Avoid caffeine , especially in the afternoon and evening.",
      "claim": "Sleep-habit measures such as consistent timing, avoiding afternoon/evening caffeine, and getting up after 20 minutes awake are reasonable first steps.",
      "applicability": "applicable",
      "limitation": "Consumer summary; general advice, not individualized treatment."
    },
    {
      "passageId": "4a6b77955f48c314563d3e47caeed0435c335b8b2eada4c2c4d4d47d00eca645",
      "quote": "If not getting enough sleep is affecting your daily activities, talk to your doctor.",
      "claim": "Clinician discussion is advised if insufficient sleep affects daily activities.",
      "applicability": "uncertain",
      "limitation": "Patient reports functioning; threshold of daily-activity impact not established."
    }
  ]
}
```

## Repetition 4 — retained_medlineplus

Attempted: true; failure: none

Resolved draft (or raw failed output):

```json
{
  "disposition": "SELF_CARE",
  "reviewPriority": null,
  "workType": null,
  "reason": "One month of sleep-onset difficulty with work stress and preserved function, with no reported decision-critical risk requiring clinician assessment or prescribing now, so sleep-habit guidance with an action-based safety net is sufficient.",
  "patientMessage": "You can start sleep-habit changes now: fixed bed and wake times, avoid caffeine after midday and alcohol before bed, keep the bedroom cool, dark and screen-free, and if you're awake 20 minutes, get up and do something relaxing. Stress-related sleep-onset trouble often improves with these steps. Arrange clinician review if sleep stays disrupted after a few weeks, or sooner if low mood, loss of interest, or drowsiness while driving appear.",
  "differential": [
    "Acute/short-term insomnia related to work stress",
    "Insomnia as a symptom of a mood disorder such as depression"
  ],
  "redFlags": [
    {
      "concern": "Functional impairment",
      "status": "denied",
      "quote": "I'm functioning but tired all day"
    },
    {
      "concern": "Depressed mood or loss of interest",
      "status": "unknown",
      "quote": ""
    },
    {
      "concern": "Thoughts of self-harm",
      "status": "unknown",
      "quote": ""
    },
    {
      "concern": "Night awakenings or early-morning awakening",
      "status": "unknown",
      "quote": ""
    },
    {
      "concern": "Drowsiness while driving",
      "status": "unknown",
      "quote": ""
    }
  ],
  "vitalSigns": "No vital signs reported; whether any were measured is unknown.",
  "questions": [],
  "evidenceLimitations": "Only consumer health summaries are available; mood, caffeine/alcohol use and sleep pattern details are unreported.",
  "transportIntent": null,
  "citations": [
    {
      "passageId": "a885e834a870d4a02febb4a39f2d048c9b00dee83725010a78f93f35419e0655",
      "quote": "Lifestyle changes, including good sleep habits , often help relieve acute (short-term) insomnia.",
      "claim": "Good sleep habits often relieve short-term insomnia, supporting self-care guidance first.",
      "applicability": "applicable",
      "limitation": "Consumer summary; does not establish whether this patient's one-month insomnia is acute or chronic."
    },
    {
      "passageId": "9f2e24964b00f8aae23a1065300a5d2071f37f257cb8edb25a98f94336539fc3",
      "quote": "Go to bed and wake up at the same time every day.",
      "claim": "Specific sleep-hygiene steps such as consistent bed/wake times and avoiding caffeine are recommended.",
      "applicability": "applicable",
      "limitation": "General consumer advice, not individualized."
    }
  ]
}
```

## Repetition 5 — retained_medlineplus

Attempted: true; failure: none

Resolved draft (or raw failed output):

```json
{
  "disposition": "SELF_CARE",
  "reviewPriority": null,
  "workType": null,
  "reason": "One month of sleep-onset difficulty with work stress and preserved function, with no reported symptom requiring clinician assessment, prescribing or testing now, so sleep-habit guidance with a clear escalation trigger is sufficient.",
  "patientMessage": "You can start with sleep-habit changes now: consistent bed and wake times, avoiding caffeine in the afternoon and evening, no screens in the bedroom, and getting up to do something relaxing if you're awake about 20 minutes. Stress-related trouble falling asleep often improves with these steps. If sleep trouble continues or you notice low mood, loss of interest, or sleepiness while driving, message this thread for clinician review.",
  "differential": [
    "Acute/short-term insomnia related to work stress",
    "Insomnia as a symptom of mood disorder (depressed mood and anhedonia not reported either way)"
  ],
  "redFlags": [
    {
      "concern": "Functional impairment",
      "status": "denied",
      "quote": "I'm functioning but tired all day"
    },
    {
      "concern": "Depressed mood or loss of interest",
      "status": "unknown",
      "quote": ""
    },
    {
      "concern": "Thoughts of self-harm",
      "status": "unknown",
      "quote": ""
    },
    {
      "concern": "Drowsy driving or safety risk",
      "status": "unknown",
      "quote": ""
    }
  ],
  "vitalSigns": "No vital signs reported; whether any were measured is unknown.",
  "questions": [],
  "evidenceLimitations": "Only consumer health-topic summaries are available; they are not prescribing or specialty guidance and sleep pattern beyond onset difficulty is unreported.",
  "transportIntent": null,
  "citations": [
    {
      "passageId": "9f2e24964b00f8aae23a1065300a5d2071f37f257cb8edb25a98f94336539fc3",
      "quote": "Avoid caffeine , especially in the afternoon and evening.",
      "claim": "Sleep-habit steps such as regular sleep times, avoiding afternoon/evening caffeine, and getting up if unable to sleep are reasonable first measures.",
      "applicability": "applicable",
      "limitation": "Consumer summary; general advice, not individualized assessment."
    },
    {
      "passageId": "a885e834a870d4a02febb4a39f2d048c9b00dee83725010a78f93f35419e0655",
      "quote": "Lifestyle changes, including good sleep habits , often help relieve acute (short-term) insomnia.",
      "claim": "Lifestyle changes and good sleep habits often relieve short-term insomnia.",
      "applicability": "uncertain",
      "limitation": "One month duration sits at the acute/chronic boundary in this summary."
    }
  ]
}
```

## Repetition 5 — replacement_nhlbi

Attempted: true; failure: none

Resolved draft (or raw failed output):

```json
{
  "disposition": "SELF_CARE",
  "reviewPriority": null,
  "workType": null,
  "reason": "One month of stress-related sleep-onset difficulty with preserved function and no reported decision-critical risk feature can start with sleep-habit guidance and self-monitoring rather than a clinician task now.",
  "patientMessage": "You can start now with sleep-habit steps: consistent bed and wake times, avoiding caffeine in the afternoon and evening, no alcohol or large meals near bedtime, a cool dark bedroom without screens, and getting up to do something relaxing if you can't sleep after about 20 minutes. Stressful periods commonly disrupt falling asleep. If trouble sleeping continues, worsens, or you notice low mood, loss of interest, or dozing off during the day, message us for clinician review.",
  "differential": [
    "Stress-related sleep-onset insomnia",
    "Mood disorder contributing to insomnia (not established)"
  ],
  "redFlags": [
    {
      "concern": "Functional impairment",
      "status": "denied",
      "quote": "I'm functioning but tired all day"
    },
    {
      "concern": "Depressed mood or loss of interest",
      "status": "unknown",
      "quote": ""
    },
    {
      "concern": "Thoughts of self-harm",
      "status": "unknown",
      "quote": ""
    },
    {
      "concern": "Night or early-morning awakenings",
      "status": "unknown",
      "quote": ""
    },
    {
      "concern": "Falling asleep at unsafe times (e.g. driving)",
      "status": "unknown",
      "quote": ""
    }
  ],
  "vitalSigns": "No vital signs reported; whether any were measured is unknown.",
  "questions": [],
  "evidenceLimitations": "Sources are consumer patient summaries and do not establish this patient's diagnosis, symptom frequency, or need for prescribing.",
  "transportIntent": null,
  "citations": [
    {
      "passageId": "9f2e24964b00f8aae23a1065300a5d2071f37f257cb8edb25a98f94336539fc3",
      "quote": "Go to bed and wake up at the same time every day.",
      "claim": "Sleep-habit measures such as consistent timing, avoiding evening caffeine and getting up after 20 minutes are standard self-care advice.",
      "applicability": "applicable",
      "limitation": "Consumer summary; general advice, not individualized treatment."
    },
    {
      "passageId": "4a6b77955f48c314563d3e47caeed0435c335b8b2eada4c2c4d4d47d00eca645",
      "quote": "If not getting enough sleep is affecting your daily activities, talk to your doctor.",
      "claim": "Clinician discussion is advised if insufficient sleep affects daily activities.",
      "applicability": "uncertain",
      "limitation": "Patient reports functioning, so this trigger is not currently met."
    }
  ]
}
```

## Repetition 6 — replacement_nhlbi

Attempted: true; failure: none

Resolved draft (or raw failed output):

```json
{
  "disposition": "SELF_CARE",
  "reviewPriority": null,
  "workType": null,
  "reason": "One month of stress-related difficulty falling asleep with preserved function and no reported alarm features can be managed with sleep-habit guidance and a clear escalation trigger.",
  "patientMessage": "You can start with sleep-habit steps now: consistent bed and wake times, avoiding caffeine in the afternoon and evening, no alcohol or large meals before bed, a cool dark quiet bedroom, screens out, and getting up to do something relaxing if you can't sleep after 20 minutes. Stress often drives sleep-onset trouble. If sleep problems continue, or you notice low mood, loss of interest, or dozing off during the day, message a Counsel clinician for review.",
  "differential": [
    "Stress-related sleep-onset insomnia",
    "Sleep disturbance from an underlying mood or other sleep disorder"
  ],
  "redFlags": [
    {
      "concern": "Functional impairment",
      "status": "denied",
      "quote": "I'm functioning but tired all day"
    },
    {
      "concern": "Depressed mood or loss of interest",
      "status": "unknown",
      "quote": ""
    },
    {
      "concern": "Night or early-morning awakenings",
      "status": "unknown",
      "quote": ""
    },
    {
      "concern": "Snoring, gasping or witnessed apneas",
      "status": "unknown",
      "quote": ""
    }
  ],
  "vitalSigns": "No vital signs reported; whether any were measured is unknown.",
  "questions": [],
  "evidenceLimitations": "Sources are consumer education summaries that do not confirm a diagnosis, duration threshold or care setting for this patient.",
  "transportIntent": null,
  "citations": [
    {
      "passageId": "9f2e24964b00f8aae23a1065300a5d2071f37f257cb8edb25a98f94336539fc3",
      "quote": "Go to bed and wake up at the same time every day.",
      "claim": "Sleep-habit measures such as fixed sleep times, caffeine and alcohol avoidance, and a cool dark quiet bedroom are recommended self-care for poor sleep.",
      "applicability": "applicable",
      "limitation": "General consumer advice, not individualized insomnia treatment."
    },
    {
      "passageId": "4a6b77955f48c314563d3e47caeed0435c335b8b2eada4c2c4d4d47d00eca645",
      "quote": "If not getting enough sleep is affecting your daily activities, talk to your doctor.",
      "claim": "Clinician discussion is advised if insufficient sleep affects daily activities.",
      "applicability": "uncertain",
      "limitation": "Patient reports functioning, so this threshold is not clearly met."
    }
  ]
}
```

## Repetition 6 — retained_medlineplus

Attempted: true; failure: none

Resolved draft (or raw failed output):

```json
{
  "disposition": "SELF_CARE",
  "reviewPriority": null,
  "workType": null,
  "reason": "One month of sleep-onset difficulty with work stress and preserved function, without reported red-flag or decision-critical features, can start with sleep-habit self-care and a clear escalation trigger if it persists or worsens.",
  "patientMessage": "You can start now with sleep-habit steps: consistent bed and wake times, no caffeine in the afternoon or evening, no screens or large meals near bedtime, a cool dark room, and getting up to do something calm if you're awake past about 20 minutes. Stress-related sleep-onset trouble often responds to this. If sleep stays poor after a few weeks, or low mood, hopelessness, or drowsy driving appear, message a Counsel clinician here for review.",
  "differential": [
    "Acute/short-term insomnia related to work stress",
    "Insomnia as a symptom of an underlying mood disorder (mood symptoms not reported)"
  ],
  "redFlags": [
    {
      "concern": "Functional impairment",
      "status": "denied",
      "quote": "I'm functioning but tired all day"
    },
    {
      "concern": "Depressed mood or anhedonia",
      "status": "unknown",
      "quote": ""
    },
    {
      "concern": "Thoughts of self-harm",
      "status": "unknown",
      "quote": ""
    },
    {
      "concern": "Night awakenings or early-morning waking",
      "status": "unknown",
      "quote": ""
    }
  ],
  "vitalSigns": "No vital signs reported; whether any were measured is unknown.",
  "questions": [],
  "evidenceLimitations": "Consumer health summaries only; no mood, caffeine, or medication history reported, so an underlying contributor cannot be excluded.",
  "transportIntent": null,
  "citations": [
    {
      "passageId": "a885e834a870d4a02febb4a39f2d048c9b00dee83725010a78f93f35419e0655",
      "quote": "Lifestyle changes, including good sleep habits , often help relieve acute (short-term) insomnia.",
      "claim": "Sleep-habit lifestyle changes often relieve short-term insomnia.",
      "applicability": "applicable",
      "limitation": "Consumer summary; duration of about one month blurs acute/chronic categorization."
    },
    {
      "passageId": "9f2e24964b00f8aae23a1065300a5d2071f37f257cb8edb25a98f94336539fc3",
      "quote": "Go to bed and wake up at the same time every day.",
      "claim": "Specific sleep-hygiene steps such as fixed sleep times, avoiding afternoon caffeine, and getting up after 20 minutes awake are recommended.",
      "applicability": "applicable",
      "limitation": "General guidance, not individualized to this patient."
    }
  ]
}
```
