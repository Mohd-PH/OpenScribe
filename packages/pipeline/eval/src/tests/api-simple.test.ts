import assert from "node:assert/strict"
import test from "node:test"

/**
 * FOCUSED API TEST - Tests real HTTP endpoints without hanging on SSE
 * 
 * Tests:
 * 1. POST /api/transcription/segment (upload audio segment)
 * 2. POST /api/transcription/final (upload final audio)
 * 
 * DELIBERATELY SKIPS SSE streaming to avoid hanging.
 */

const API_BASE = "http://localhost:3001"

async function checkServer(): Promise<boolean> {
  try {
    await fetch(API_BASE, { method: "HEAD" })
    return true
  } catch {
    return false
  }
}

function generateAudio(durationSecs: number): Float32Array {
  const sampleRate = 16000
  const samples = new Float32Array(sampleRate * durationSecs)
  for (let i = 0; i < samples.length; i++) {
    samples[i] = Math.sin((2 * Math.PI * 440 * i) / sampleRate) * 0.3
  }
  return samples
}

test("API Test: Upload segment and final audio", { timeout: 60_000 }, async (t) => {
  console.log("\n=== API ENDPOINT TEST ===\n")
  
  // Check server
  if (!(await checkServer())) {
    console.log("❌ Server not running on localhost:3001")
    t.skip("Server not running")
    return
  }
  console.log("✅ Server running\n")
  
  if (!process.env.OPENAI_API_KEY) {
    console.log("❌ OPENAI_API_KEY not set")
    t.skip("No API key")
    return
  }
  console.log("✅ API key set\n")
  
  // Import audio processing
  const audio = await import("../../../audio-ingest/src/capture/audio-processing.js")
  
  // Create a single 10-second segment
  console.log("⏳ Creating 10-second audio segment...")
  const samples = generateAudio(10)
  const blob = audio.createWavBlob(samples, 16000)
  console.log(`✅ Created ${blob.size} byte WAV file\n`)
  
  // Upload segment
  console.log("⏳ Uploading to /api/transcription/segment...")
  const sessionId = `test-${Date.now()}`
  
  const formData = new FormData()
  formData.append("session_id", sessionId)
  formData.append("seq_no", "0")
  formData.append("start_ms", "0")
  formData.append("end_ms", "10000")
  formData.append("duration_ms", "10000")
  formData.append("overlap_ms", "250")
  formData.append("file", blob, "segment-0.wav")
  
  const segmentStart = Date.now()
  const segmentResponse = await fetch(`${API_BASE}/api/transcription/segment`, {
    method: "POST",
    body: formData,
  })
  const segmentDuration = Date.now() - segmentStart
  
  console.log(`Response: ${segmentResponse.status}`)
  if (segmentResponse.ok) {
    console.log(`✅ Segment uploaded and transcribed (${segmentDuration}ms)\n`)
  } else {
    const error = await segmentResponse.json()
    console.log(`❌ Failed:`, error)
    assert.fail(`Segment upload failed: ${segmentResponse.status}`)
  }
  
  // Upload final audio
  console.log("⏳ Creating 15-second final audio...")
  const finalSamples = generateAudio(15)
  const finalBlob = audio.createWavBlob(finalSamples, 16000)
  console.log(`✅ Created ${finalBlob.size} byte WAV file\n`)
  
  console.log("⏳ Uploading to /api/transcription/final...")
  const finalFormData = new FormData()
  finalFormData.append("session_id", sessionId)
  finalFormData.append("file", finalBlob, "final.wav")
  
  const finalStart = Date.now()
  const finalResponse = await fetch(`${API_BASE}/api/transcription/final`, {
    method: "POST",
    body: finalFormData,
  })
  const finalDuration = Date.now() - finalStart
  
  console.log(`Response: ${finalResponse.status}`)
  if (finalResponse.ok) {
    console.log(`✅ Final audio uploaded and transcribed (${finalDuration}ms)\n`)
  } else {
    const error = await finalResponse.json()
    console.log(`❌ Failed:`, error)
    assert.fail(`Final upload failed: ${finalResponse.status}`)
  }
  
  console.log("=== TEST PASSED ===\n")
  console.log(`Session ID: ${sessionId}`)
  console.log(`Total API time: ${segmentDuration + finalDuration}ms`)
  console.log(`Cost: ~$0.004\n`)
  
  setTimeout(() => process.exit(0), 100)
})
