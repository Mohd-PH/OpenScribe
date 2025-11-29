"use server"

import { generateText } from "ai"
import { createOpenAI } from "@ai-sdk/openai"

export async function transcribeAudio(audioBlob: Blob, apiKey: string | null): Promise<string> {
  console.log("=".repeat(80))
  console.log("TRANSCRIBING AUDIO")
  console.log("=".repeat(80))
  console.log(`Audio blob size: ${audioBlob.size} bytes`)
  console.log(`Audio blob type: ${audioBlob.type}`)
  
  if (!apiKey) {
    console.warn("⚠️  No API key provided - transcription will fail")
    throw new Error("API key required for transcription")
  }

  try {
    const formData = new FormData()
    // Determine file extension based on blob type
    let filename = "audio.webm"
    if (audioBlob.type.includes("mp4")) {
      filename = "audio.mp4"
    } else if (audioBlob.type.includes("mpeg")) {
      filename = "audio.mpeg"
    } else if (audioBlob.type.includes("wav")) {
      filename = "audio.wav"
    }
    
    formData.append("file", audioBlob, filename)
    formData.append("model", "whisper-1")
    
    console.log("📤 Sending audio to Whisper API...")
    
    const response = await fetch("https://api.openai.com/v1/audio/transcriptions", {
      method: "POST",
      headers: { Authorization: `Bearer ${apiKey}` },
      body: formData,
    })

    if (!response.ok) {
      const errorText = await response.text()
      console.error("❌ Whisper API error:", response.status, errorText)
      throw new Error(`Whisper API error: ${response.status} - ${errorText}`)
    }

    const result = await response.json()
    const transcript = result.text || ""
    
    console.log("=".repeat(80))
    console.log("TRANSCRIPTION COMPLETE")
    console.log("=".repeat(80))
    console.log("TRANSCRIBED TEXT:")
    console.log("-".repeat(80))
    console.log(transcript)
    console.log("-".repeat(80))
    console.log(`Transcript length: ${transcript.length} characters`)
    console.log("=".repeat(80))
    
    return transcript
  } catch (error) {
    console.error("❌ Transcription failed:", error)
    throw error
  }
}

export async function generateClinicalNote(params: {
  transcript: string
  patient_name: string
  visit_reason: string
  apiKey: string | null
}): Promise<string> {
  const { transcript, patient_name, visit_reason, apiKey } = params

  const systemPrompt = `You are a clinical documentation assistant that converts patient encounter transcripts into structured clinical notes.

IMPORTANT INSTRUCTIONS:
- Output ONLY plain text in the exact format shown below
- Do NOT use JSON, markdown code blocks, or any special formatting
- Use ONLY information explicitly stated in the transcript itself
- Do NOT use patient name or visit reason to infer or invent any information
- If a section has no relevant information in the transcript, leave it completely empty (just the section header followed by a blank line)
- Do NOT add placeholder text like "Not discussed", "Not documented", "Not performed", or any other defaults
- Do NOT infer, assume, or invent information - only include what is explicitly stated in the transcript
- If the transcript is empty or has no relevant content, ALL sections must be left empty
- Use professional medical terminology while keeping notes concise
- This is a DRAFT that requires clinician review

OUTPUT FORMAT (follow exactly):

Chief Complaint:
[Primary reason for visit in 1-2 sentences, or leave empty if not stated]

HPI:
[History of present illness - onset, duration, character, severity, modifying factors, or leave empty if not stated]

ROS:
[Review of systems - symptoms mentioned, organized by system, or leave empty if not stated]

Physical Exam:
[Any exam findings mentioned, or leave empty if not stated]

Assessment:
[Clinical assessment/diagnosis mentioned by clinician, or leave empty if not stated]

Plan:
[Treatment plan discussed with patient, or leave empty if not stated]`

  console.log("=".repeat(80))
  console.log("GENERATING CLINICAL NOTE")
  console.log("=".repeat(80))
  console.log(`Patient Name: ${patient_name || "Not provided"}`)
  console.log(`Visit Reason: ${visit_reason || "Not provided"}`)
  console.log(`Transcript length: ${transcript.length} characters`)
  
  // If transcript is empty, return empty note structure
  if (!transcript || transcript.trim().length === 0) {
    console.log("⚠️  Transcript is empty - returning empty note structure")
    const emptyNote = `Chief Complaint:


HPI:


ROS:


Physical Exam:


Assessment:


Plan:`
    console.log("=".repeat(80))
    console.log("FINAL CLINICAL NOTE (EMPTY):")
    console.log("-".repeat(80))
    console.log(emptyNote)
    console.log("-".repeat(80))
    console.log("=".repeat(80))
    return emptyNote
  }

  console.log("📝 Transcript being used for note generation:")
  console.log("-".repeat(80))
  console.log(transcript)
  console.log("-".repeat(80))

  const userPrompt = `Convert this clinical encounter transcript into a structured note. Use ONLY the information explicitly stated in the transcript below. Do not infer or invent any information.

Patient Name: ${patient_name || "Not provided"} (for reference only - do not use to infer information)
Visit Reason: ${visit_reason || "Not provided"} (for reference only - do not use to infer information)

TRANSCRIPT:
${transcript}

Generate the clinical note now, following the exact format specified. Only include information explicitly stated in the transcript above.`

  try {
    console.log("🤖 Calling LLM to generate clinical note...")
    let text: string
    
    if (apiKey) {
      const openai = createOpenAI({ apiKey })
      const result = await generateText({
        model: openai("gpt-4o"),
        system: systemPrompt,
        prompt: userPrompt,
      })
      text = result.text
    } else {
      // Fallback to AI Gateway (no API key needed)
      const result = await generateText({
        model: "openai/gpt-4o",
        system: systemPrompt,
        prompt: userPrompt,
      })
      text = result.text
    }
    
    console.log("=".repeat(80))
    console.log("FINAL CLINICAL NOTE:")
    console.log("=".repeat(80))
    console.log(text)
    console.log("=".repeat(80))
    console.log(`Note length: ${text.length} characters`)
    console.log("=".repeat(80))
    
    return text
  } catch (error) {
    console.error("❌ AI generation error:", error)
    throw new Error(`Failed to generate note: ${error instanceof Error ? error.message : "Unknown error"}`)
  }
}
