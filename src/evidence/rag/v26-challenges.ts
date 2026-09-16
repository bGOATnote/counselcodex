/** Authored retrieval probes, NOT physician gold or clinical treatment rules.
 * Labels target document+section retrieval; they do not endorse source claims.
 * Frozen before running either candidate ranking or hint ablation. */
import type { RetrievalIntent } from "./v26.ts";
export type V26Challenge = { id:string; queries:string[]; intent:RetrievalIntent; targets:{document:string;section:string}[]; topic:string };
export const V26_CHALLENGES:V26Challenge[] = [
  {id:"R01",queries:["heart attack suspected chest pressure ambulance","heart attack emergency transport timing"],intent:"triage",targets:[{document:"nhlbi:heart-attack-symptoms",section:"When to call"}],topic:"suspected cardiac emergency action"},
  {id:"R02",queries:["stroke sudden weakness trouble speaking","stroke symptoms immediate emergency help"],intent:"red_flags",targets:[{document:"cdc:stroke",section:"Signs and symptoms"}],topic:"stroke warning action"},
  {id:"R03",queries:["venous thromboembolism leg swelling pain care","venous thromboembolism testing diagnosis"],intent:"triage",targets:[{document:"cdc:vte",section:"Signs and symptoms"},{document:"cdc:vte",section:"Testing and diagnosis"}],topic:"VTE assessment and setting"},
  {id:"R04",queries:["migraine secondary headache warning features","migraine red flags associated secondary headaches"],intent:"red_flags",targets:[{document:"pmc:PMC8321897",section:"Tab2:"}],topic:"headache red flags"},
  {id:"R05",queries:["migraine acute treatment triptan","migraine second line medication contraindications"],intent:"management",targets:[{document:"pmc:PMC8321897",section:"Step 4: Acute treatment / Second-line medication"},{document:"pmc:PMC8321897",section:"Tab3:"}],topic:"acute migraine therapy considerations"},
  {id:"R06",queries:["migraine follow-up response referral","migraine specialist referral when treatment fails"],intent:"triage",targets:[{document:"pmc:PMC8321897",section:"Step 7: Follow-up"}],topic:"migraine follow-through"},
  {id:"R07",queries:["anaphylaxis monitoring disposition","anaphylaxis observation admission discharge"],intent:"triage",targets:[{document:"openem:anaphylaxis",section:"Disposition"}],topic:"post-treatment monitoring; not initial-home-care permission"},
  {id:"R08",queries:["cauda equina back pain urinary retention","cauda equina emergent assessment transfer"],intent:"triage",targets:[{document:"openem:cauda-equina-syndrome",section:"Critical Actions"},{document:"openem:cauda-equina-syndrome",section:"Disposition"}],topic:"spine emergency assessment"},
  {id:"R09",queries:["diabetic ketoacidosis level of care","diabetic ketoacidosis admission monitoring"],intent:"triage",targets:[{document:"openem:diabetic-ketoacidosis",section:"Disposition"}],topic:"DKA monitoring setting"},
  {id:"R10",queries:["ectopic pregnancy pain bleeding syncope","ectopic pregnancy disposition reliable follow-up"],intent:"triage",targets:[{document:"openem:ectopic-pregnancy",section:"Disposition"},{document:"openem:ectopic-pregnancy",section:"Critical Actions"}],topic:"ectopic evaluation and follow-up prerequisites"},
  {id:"R11",queries:["pneumonia outpatient admission severity","pneumonia oxygenation disposition"],intent:"triage",targets:[{document:"openem:pneumonia",section:"Disposition"}],topic:"pneumonia setting criteria"},
  {id:"R12",queries:["pulmonary embolism outpatient eligibility","pulmonary embolism disposition follow-up"],intent:"triage",targets:[{document:"openem:pulmonary-embolism",section:"Disposition"}],topic:"PE outpatient prerequisites after diagnosis"},
  {id:"R13",queries:["sepsis admission monitoring","sepsis shock disposition"],intent:"triage",targets:[{document:"openem:sepsis",section:"Disposition"}],topic:"sepsis care setting"},
  {id:"R14",queries:["subarachnoid hemorrhage transfer neurosurgery","subarachnoid hemorrhage disposition"],intent:"triage",targets:[{document:"openem:subarachnoid-hemorrhage",section:"Disposition"}],topic:"SAH setting and transfer"},
  {id:"R15",queries:["syncope risk telemetry admission","syncope discharge follow-up criteria"],intent:"triage",targets:[{document:"openem:syncope",section:"Disposition"}],topic:"syncope disposition prerequisites"},
  {id:"R16",queries:["migraine explanation triggers","migraine education patient centricity"],intent:"education",targets:[{document:"pmc:PMC8321897",section:"Step 3: Education"}],topic:"education control"},
  {id:"R17",queries:["qzxvplm aurorazeta zzqprx","tqzxvplm vvrqzz"],intent:"triage",targets:[],topic:"out-of-corpus gibberish control; no target"},
  {id:"R18",queries:["clinic software password reset portal login","insurance invoice billing receipt"],intent:"education",targets:[],topic:"nonclinical control; no target"},
];
