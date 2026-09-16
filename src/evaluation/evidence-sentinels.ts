// Development sentinels, NOT a held-out clinical benchmark. Expectations are
// source relevance annotations authored during implementation, not care labels.
export type EvidenceSentinel = { id: string; message: string; relevant: string[]; forbidden?: string[]; abstain?: boolean };
export const evidenceSentinels: EvidenceSentinel[] = [
  { id: "cardiac", message: "I have chest pressure.", relevant: ["aha-heart-attack"], forbidden: ["afp-pleuritic-2017"] },
  { id: "cardiac-paraphrase", message: "I have pressure behind my breastbone.", relevant: ["aha-heart-attack"] },
  { id: "stroke", message: "My speech suddenly became slurred.", relevant: ["asa-stroke"] },
  { id: "stroke-paraphrase", message: "All of a sudden my words are coming out garbled.", relevant: ["asa-stroke"] },
  { id: "foot", message: "My diabetic left sole has an ulcer.", relevant: ["idsa-dfi-2023", "nice-ng19"] },
  { id: "allergic-not-cardiac", message: "I ate shrimp and now my lips and tongue feel swollen, my throat feels tight, and hives are on my chest.", relevant: ["nhs-anaphylaxis"], forbidden: ["aha-heart-attack", "afp-pleuritic-2017"] },
  { id: "menopause", message: "52F. Menopause symptoms: hot flashes and night sweats.", relevant: [], abstain: true },
  { id: "denied-chest", message: "The room spins when I roll over in bed. No chest pain.", relevant: [], abstain: true },
  { id: "cold", message: "A runny nose and mild sore throat for two days.", relevant: ["cdc-common-cold", "mayo-cranial-csf"] },
  { id: "postoperative-nose", message: "Clear fluid from one nostril after pituitary surgery.", relevant: ["mayo-cranial-csf", "cuh-pituitary-aftercare"] },
  { id: "breathing", message: "I have COPD and am more short of breath.", relevant: ["nhs-breathlessness"], forbidden: ["aha-heart-attack"] },
  { id: "thunderclap-adult", message: "45F. Sudden thunderclap headache.", relevant: ["headache"] },
  { id: "adult-source-child", message: "My 8-year-old has a headache.", relevant: [], forbidden: ["headache"], abstain: true },
  { id: "dka", message: "I have diabetes. My blood sugar stays at 400 and I am vomiting.", relevant: ["dka"] },
  { id: "meningococcal", message: "Fever and purple spots that don't fade. My child is hard to wake.", relevant: ["meningococcal"] },
  { id: "suicidal", message: "I think everyone would be better off without me.", relevant: ["suicide"] },
  { id: "refill-gap", message: "Can you renew my finasteride prescription?", relevant: [], abstain: true },
  { id: "veterinary", message: "My dog has a diabetic foot ulcer.", relevant: [], abstain: true },
  { id: "label-leak", message: "C04 ASYNC_PHYSICIAN URGENT_ESCALATION", relevant: [], abstain: true },
  // Deliberately retain harder failures; do not patch aliases just to pass.
  { id: "cardiac-euphemism-gap", message: "An elephant is sitting on me and my jaw aches.", relevant: ["aha-heart-attack"] },
  { id: "stroke-language-gap", message: "I was talking fine, then couldn't make the words come out.", relevant: ["asa-stroke"] },
  { id: "third-person-context", message: "My sister had a stroke years ago. I need a routine medication refill.", relevant: [], abstain: true },
  { id: "meningococcal-paraphrase-gap", message: "Fever, tiny red dots stay red under a glass, and barely waking up.", relevant: ["meningococcal"] },
  { id: "mixed-subject-gap", message: "My cat is well. I have new chest pressure.", relevant: ["aha-heart-attack"] },
];
