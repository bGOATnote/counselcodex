// Shared bibliographic inventory. Listing is NOT source-content or clinical approval.
export type ClinicalSource = {
  id: string; title: string; publisher: string; url: string;
  kind: string; publication: string; reviewedAt: string; accessScope: string;
};
function source(id: string, title: string, publisher: string, url: string, kind: string, publication: string, accessScope = "Public article/page; not a systematic review of all guidance"): ClinicalSource {
  return { id, title, publisher, url, kind, publication, reviewedAt: "2026-09-10", accessScope };
}
export const clinicalSources: ClinicalSource[] = [
  source("cold", "Treatment of the Common Cold", "AAFP / AFP", "https://www.aafp.org/afp/2019/0901/p281?wm=3049_b111", "Evidence review", "2019"),
  source("acs", "Key Patient Messages: 2025 Acute Coronary Syndromes Guideline", "American Heart Association", "https://professional.heart.org/en/science-news/patient-resources/key-patient-messages-2025-acute-coronary-syndromes-guideline", "Guideline-linked patient guidance", "2025"),
  source("uti", "Acute Uncomplicated UTIs in Adults: Rapid Evidence Review", "AAFP / AFP", "https://www.aafp.org/afp/2024/0200/acute-uncomplicated-utis-adults", "Evidence review", "2024"),
  source("foot", "Diabetes-Related Foot Infections: Diagnosis and Treatment", "AAFP / AFP", "https://www.aafp.org/afp/2021/1000/p386", "Evidence review", "2021"),
  source("dfiinfection", "IWGDF/IDSA Guidelines on Diabetes-Related Foot Infections", "IWGDF / IDSA", "https://www.idsociety.org/practice-guideline/diabetic-foot-infections/", "Clinical guideline", "2023", "Recommendations 1–3, 7 and clinical rationale reviewed; no infection grade inferred from text alone"),
  source("dfireferral", "Diabetic foot problems: prevention and management", "NICE NG19", "https://www.nice.org.uk/guidance/ng19/chapter/Recommendations", "UK clinical guideline", "2015; updated 2019", "Referral recommendations 1.4.1–1.4.2; one working day is not identical to 24 hours; local adaptation required"),
  source("suicide", "The Suicidal Patient: Evaluation and Management", "AAFP / AFP", "https://www.aafp.org/afp/2021/0401/p417", "Evidence review", "2021"),
  source("losartan", "Losartan potassium prescribing information", "DailyMed / NLM", "https://dailymed.nlm.nih.gov/dailymed/drugInfo.cfm?setid=289bf859-308d-0184-e063-6394a90a9e3d", "Product-specific drug label", "Current page; verify product/revision at prescribing"),
  source("fever", "Management of Fever in Infants and Young Children", "AAFP / AFP", "https://www.aafp.org/afp/2020/0615/p721", "Evidence review", "2020"),
  source("headache", "Acute Headache in Adults: A Diagnostic Approach", "AAFP / AFP", "https://www.aafp.org/afp/2022/0900/acute-headache-adults", "Evidence review", "2022"),
  source("preeclampsia", "Preeclampsia and High Blood Pressure During Pregnancy", "ACOG", "https://www.acog.org/womens-health/faqs/preeclampsia-and-high-blood-pressure-during-pregnancy", "Patient FAQ", "Page date not independently established", "Public FAQ/search-index content; not full Practice Bulletin 222"),
  source("abdomen", "Acute Abdominal Pain in Adults: Evaluation and Diagnosis", "AAFP / AFP", "https://www.aafp.org/afp/2023/0600/acute-abdominal-pain-adults", "Evidence review", "2023"),
  source("pruritus", "Pruritus: Diagnosis and Management", "AAFP / AFP", "https://www.aafp.org/afp/2022/0100/p55", "Evidence review", "2022"),
  source("copd", "COPD Exacerbations", "AAFP", "https://www.aafp.org/assets/image/upload/v1771246462/Migrated%20-%20PDFs%20%28AEM%29/Patient%20Care/copd/COPD%20exacerbations%20Fact%20Sheet%201-pdf.pdf", "Clinical fact sheet (PDF)", "Page revision not independently established"),
  source("carpal", "Carpal Tunnel Syndrome: Rapid Evidence Review", "AAFP / AFP", "https://www.aafp.org/afp/2024/0700/carpal-tunnel-syndrome", "Evidence review", "2024"),
  source("anaphylaxis", "Anaphylaxis: Recognition and Management", "AAFP / AFP", "https://www.aafp.org/pubs/afp/issues/2020/0915/p355.pdf", "Evidence review (PDF)", "2020"),
  source("sti", "STI Screening Recommendations", "CDC", "https://www.cdc.gov/std/treatment-guidelines/screening-recommendations.htm", "Guideline screening table", "2024 page review; 2021 guideline framework"),
  source("back", "Management of Low Back Pain: Guidelines From the VA/DoD", "AAFP / AFP", "https://www.aafp.org/afp/2023/0400/practice-guidelines-low-back-pain", "Guideline summary", "2023"),
  source("asthma", "Asthma: Updated Diagnosis and Management Recommendations from GINA", "AAFP / AFP", "https://www.aafp.org/pubs/afp/issues/2020/0615/p762.html", "Guideline summary", "2020; not the 2026 GINA report"),
  source("dizziness", "Dizziness: Evaluation and Management", "AAFP / AFP", "https://www.aafp.org/afp/2023/0500/dizziness", "Evidence review", "2023"),
  source("headinjury", "Head injury: assessment and early management — recommendations", "NICE", "https://www.nice.org.uk/guidance/NG232/chapter/recommendations", "UK clinical guideline", "NG232 (2023); local adaptation required"),
  source("eye", "Eye Emergencies", "AAFP / AFP", "https://www.aafp.org/afp/2020/1101/p539", "Evidence review", "2020"),
  source("ankle", "Management of Acute Ankle Sprains: Common Questions and Answers", "AAFP / AFP", "https://www.aafp.org/afp/2025/1200/acute-ankle-sprains", "Evidence review", "2025"),
  source("tia", "Stroke symptoms, even if they disappear within an hour, need emergency assessment", "American Heart Association", "https://newsroom.heart.org/news/stroke-symptoms-even-if-they-disappear-within-an-hour-need-emergency-assessment", "Scientific-statement summary", "2023"),
  source("contraception", "Combined Hormonal Contraceptives", "CDC", "https://www.cdc.gov/contraception/hcp/usspr/combined-hormonal-contraceptives.html", "US Selected Practice Recommendations", "2024"),
  source("vte", "Venous thromboembolic diseases — recommendations", "NICE", "https://www.nice.org.uk/guidance/ng158/chapter/Recommendations", "UK clinical guideline", "NG158; local adaptation required"),
  source("bleeding", "Bleeding During Pregnancy", "ACOG", "https://www.acog.org/womens-health/faqs/bleeding-during-pregnancy", "Patient FAQ", "Page date not independently established", "Public FAQ/search-index content; not full practice bulletin"),
  source("ectopic", "Ectopic Pregnancy", "ACOG", "https://www.acog.org/womens-health/faqs/ectopic-pregnancy", "Patient FAQ", "Page date not independently established", "Public FAQ/search-index content; not full practice bulletin"),
  source("lipids", "ACC, AHA Issue Updated Guideline for Managing Lipids, Cholesterol", "American College of Cardiology", "https://www.acc.org/about-acc/press-releases/2026/03/13/18/01/accaha-issue-updated-guideline-for-managing-lipids-cholesterol", "Guideline announcement/summary", "2026; not full guideline review"),
  source("ear", "Otitis Media: Rapid Evidence Review", "AAFP / AFP", "https://www.aafp.org/afp/2019/0915/p350", "Evidence review", "2019"),
  source("dka", "Diabetic Ketoacidosis", "CDC", "https://www.cdc.gov/diabetes/about/diabetic-ketoacidosis.html", "Patient safety guidance", "2024"),
  source("rhinitis", "Allergic Rhinitis: Rapid Evidence Review", "AAFP / AFP", "https://www.aafp.org/afp/2023/0500/allergic-rhinitis", "Evidence review", "2023"),
  source("gibleed", "Upper Gastrointestinal Bleeding in Adults: Evaluation and Management", "AAFP / AFP", "https://www.aafp.org/afp/2020/0301/p294", "Evidence review", "2020"),
  source("acne", "Acne clinical guideline", "American Academy of Dermatology", "https://www.aad.org/member/clinical-quality/guidelines/acne", "Guideline highlights", "2024"),
  source("torsion", "Testicular Torsion: Diagnosis, Evaluation, and Management", "AAFP / AFP", "https://www.aafp.org/pubs/afp/issues/2013/1215/p835.html", "Evidence review", "2013; older source, emergency principle only"),
  source("perinatal", "Summary of Perinatal Mental Health Conditions", "ACOG", "https://www.acog.org/programs/perinatal-mental-health/summary-of-perinatal-mental-health-conditions", "Clinical summary", "Page date not independently established", "Search-index excerpts available; direct access blocked during research"),
  source("meningococcal", "Meningococcal Disease Symptoms and Complications", "CDC", "https://www.cdc.gov/meningococcal/symptoms/", "Patient safety guidance", "2026"),
  source("menopause", "Hormone Therapy for Menopause", "ACOG", "https://www.acog.org/womens-health/faqs/hormone-therapy-for-menopause", "Patient FAQ", "Page date not independently established", "Public FAQ/search-index content; not full practice bulletin"),
  source("tb", "Signs and Symptoms of Tuberculosis", "CDC", "https://www.cdc.gov/tb/signs-symptoms/index.html", "Public health guidance", "2025"),
  source("hf", "Managing Heart Failure Symptoms", "American Heart Association", "https://www.heart.org/en/health-topics/heart-failure/warning-signs-of-heart-failure/managing-heart-failure-symptoms", "Patient safety guidance", "Current page; revision not independently established"),
  source("finasteride", "PROPECIA (finasteride) prescribing information", "DailyMed / NLM", "https://dailymed.nlm.nih.gov/dailymed/lookup.cfm?setid=6f904709-65aa-44ce-b144-b4c8a0416e36", "Product-specific drug label", "Current page; verify product/revision at prescribing"),
  source("insomnia", "Chronic Insomnia in Adults", "AAFP / AFP", "https://www.aafp.org/afp/2024/0200/chronic-insomnia-adults", "Evidence review", "2024; chronic criteria do not establish C47 diagnosis"),
  source("hip", "Hip Fractures: Diagnosis and Management", "AAFP / AFP", "https://www.aafp.org/afp/2022/1200/hip-fractures", "Evidence review", "2022"),
  source("pleuritic", "Pleuritic Chest Pain: Sorting Through the Differential Diagnosis", "AAFP / AFP", "https://www.aafp.org/afp/2017/0901/p306", "Evidence review", "2017; differential framework, not complete current PE guideline"),
];
