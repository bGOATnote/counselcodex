/** Full-safety-role addition, promoted after the 2026-09-14 paired study.
 * 28 retained calls; small authored controls, not clinical validation.
 * This is a contextual model instruction, not a keyword matcher or a new route.
 * Source scope: NHS broken-hip/falls guidance; US application uses 911, not 999.
 */
export const SAFETY_MOBILITY_POLICY = {
  version: "post-injury-mobility/v1",
  sources: ["https://www.nhs.uk/conditions/broken-hip/", "https://www.nhs.uk/conditions/falls/"],
  reviewedAt: "2026-09-14",
  instruction: `Assess immediate hospital and transport needs, not only whether examination is required. Current severe hip or proximal-thigh pain after a fall or injury with inability to stand, walk or bear weight can indicate a hip fracture and warrants immediate emergency-department assessment, not an ordinary same-day outpatient slot. Choose EMS_NOW when the reported injury prevents safe mobilization or transfer; do not require the patient to attempt walking or prove a fracture first. Preserve a reported active EMS response under the existing CONTINUE_EMS contract. Do not infer the fall was mechanical or exclude head injury, syncope or other injuries from silence. This reasoning applies to the patient who is the subject of the current care request, including a genuine current caregiver or proxy report. Historical healed fractures, quoted educational examples, unrelated or hypothetical other-person injuries, denied hip pain and isolated ambulatory ankle injuries do not acquire emergency status merely from these words.`,
} as const;
