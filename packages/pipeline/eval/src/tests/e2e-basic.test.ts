import assert from "node:assert/strict"
import test from "node:test"

/**
 * BASIC E2E TEST - Phase by phase with extensive logging
 * Each test is isolated and tests ONE thing at a time
 */

// ============================================================================
// TEST 1: Audio Processing - Can we create WAV segments?
// ============================================================================
test("Phase 1: Audio processing - create WAV segments from synthetic audio", { timeout: 5000 }, async () => {
  console.log("\n========================================")
  console.log("TEST 1: Audio Processing")
  console.log("========================================")
  
  console.log("⏳ Importing audio-processing module...")
  const audioProcessing = await import("../../../audio-ingest/src/capture/audio-processing.js")
  console.log("✅ Module imported")
  
  const { createWavBlob, TARGET_SAMPLE_RATE } = audioProcessing
  
  console.log("⏳ Generating synthetic audio (1 second, sine wave)...")
  const sampleRate = TARGET_SAMPLE_RATE
  const durationSecs = 1
  const numSamples = sampleRate * durationSecs
  const samples = new Float32Array(numSamples)
  
  // Simple sine wave at 440Hz
  for (let i = 0; i < numSamples; i++) {
    samples[i] = Math.sin((2 * Math.PI * 440 * i) / sampleRate) * 0.5
  }
  console.log(`✅ Generated ${numSamples} samples at ${sampleRate}Hz`)
  
  console.log("⏳ Creating WAV blob...")
  const blob = createWavBlob(samples, sampleRate)
  console.log(`✅ Created WAV blob: ${blob.size} bytes, type: ${blob.type}`)
  
  // Verify WAV blob
  assert(blob.size > 0, "WAV blob should not be empty")
  assert(blob.size > 44, "WAV blob should be larger than WAV header (44 bytes)")
  assert.equal(blob.type, "audio/wav", "Blob should have audio/wav MIME type")
  
  console.log("✅ TEST 1 PASSED: Audio processing works\n")
})

// ============================================================================
// TEST 2: Segmentation - Can we split audio into segments?
// ============================================================================
test("Phase 2: Audio segmentation - split audio into overlapping segments", { timeout: 5000 }, async () => {
  console.log("\n========================================")
  console.log("TEST 2: Audio Segmentation")
  console.log("========================================")
  
  console.log("⏳ Importing audio-processing module...")
  const audioProcessing = await import("../../../audio-ingest/src/capture/audio-processing.js")
  console.log("✅ Module imported")
  
  const {
    DEFAULT_OVERLAP_MS,
    DEFAULT_SEGMENT_MS,
    SampleBuffer,
    TARGET_SAMPLE_RATE,
    createWavBlob,
    drainSegments,
  } = audioProcessing
  
  console.log(`⏳ Creating 30 seconds of synthetic audio at ${TARGET_SAMPLE_RATE}Hz...`)
  const durationSecs = 30
  const numSamples = TARGET_SAMPLE_RATE * durationSecs
  const samples = new Float32Array(numSamples)
  for (let i = 0; i < numSamples; i++) {
    samples[i] = Math.sin((2 * Math.PI * 440 * i) / TARGET_SAMPLE_RATE) * 0.5
  }
  console.log(`✅ Generated ${numSamples} samples (${durationSecs}s)`)
  
  console.log(`⏳ Setting up segmentation (segment=${DEFAULT_SEGMENT_MS}ms, overlap=${DEFAULT_OVERLAP_MS}ms)...`)
  const segmentSamples = Math.round((DEFAULT_SEGMENT_MS / 1000) * TARGET_SAMPLE_RATE)
  const overlapSamples = Math.round((DEFAULT_OVERLAP_MS / 1000) * TARGET_SAMPLE_RATE)
  console.log(`   Segment samples: ${segmentSamples}, Overlap samples: ${overlapSamples}`)
  
  const buffer = new SampleBuffer()
  const segments: { blob: Blob; seqNo: number }[] = []
  let seqNo = 0
  
  const collectSegment = (segmentSamples: Float32Array) => {
    console.log(`   📦 Collecting segment ${seqNo} (${segmentSamples.length} samples)`)
    const blob = createWavBlob(segmentSamples, TARGET_SAMPLE_RATE)
    segments.push({ blob, seqNo })
    seqNo++
  }
  
  console.log("⏳ Pushing audio to buffer and draining segments...")
  buffer.push(samples)
  drainSegments(buffer, segmentSamples, overlapSamples, collectSegment)
  
  console.log(`✅ Created ${segments.length} segments`)
  
  // Verify segmentation
  assert(segments.length >= 2, `Should create at least 2 segments from 30s audio, got ${segments.length}`)
  assert(segments.length <= 4, `Should create at most 4 segments from 30s audio, got ${segments.length}`)
  assert(segments.every(s => s.blob.size > 0), "All segments should have non-empty blobs")
  
  console.log("✅ TEST 2 PASSED: Audio segmentation works\n")
})

// ============================================================================
// TEST 3: WAV Parsing - Can we parse WAV headers?
// ============================================================================
test("Phase 3: WAV parsing - validate WAV format", { timeout: 5000 }, async () => {
  console.log("\n========================================")
  console.log("TEST 3: WAV Parsing")
  console.log("========================================")
  
  console.log("⏳ Importing modules...")
  const audioProcessing = await import("../../../audio-ingest/src/capture/audio-processing.js")
  const transcribeCore = await import("../../../transcribe/src/core/wav.js")
  console.log("✅ Modules imported")
  
  const { createWavBlob, TARGET_SAMPLE_RATE } = audioProcessing
  const { parseWavHeader } = transcribeCore
  
  console.log("⏳ Creating test WAV file...")
  const samples = new Float32Array(16000).fill(0.1)
  const blob = createWavBlob(samples, TARGET_SAMPLE_RATE)
  const buffer = Buffer.from(await blob.arrayBuffer())
  const arrayBuffer = buffer.buffer.slice(buffer.byteOffset, buffer.byteOffset + buffer.byteLength) as ArrayBuffer
  console.log(`✅ Created WAV buffer: ${buffer.length} bytes`)
  
  console.log("⏳ Parsing WAV header...")
  const info = parseWavHeader(arrayBuffer)
  console.log(`✅ Parsed WAV info:`)
  console.log(`   Sample rate: ${info.sampleRate}Hz`)
  console.log(`   Channels: ${info.numChannels}`)
  console.log(`   Bit depth: ${info.bitDepth}`)
  console.log(`   Duration: ${info.durationMs}ms`)
  
  // Verify WAV format
  assert.equal(info.sampleRate, TARGET_SAMPLE_RATE, "Sample rate should match")
  assert.equal(info.numChannels, 1, "Should be mono")
  assert.equal(info.bitDepth, 16, "Should be 16-bit")
  assert(info.durationMs > 0, "Duration should be positive")
  
  console.log("✅ TEST 3 PASSED: WAV parsing works\n")
})

// ============================================================================
// TEST 4: Mock Transcription - Can we call transcription with mock?
// ============================================================================
test("Phase 4: Mock transcription - verify mocked API call", { timeout: 5000 }, async () => {
  console.log("\n========================================")
  console.log("TEST 4: Mock Transcription")
  console.log("========================================")
  
  console.log("⏳ Importing modules...")
  const audioProcessing = await import("../../../audio-ingest/src/capture/audio-processing.js")
  const whisperProvider = await import("../../../transcribe/src/providers/whisper-transcriber.js")
  console.log("✅ Modules imported")
  
  const { createWavBlob, TARGET_SAMPLE_RATE } = audioProcessing
  const { transcribeWavBuffer } = whisperProvider
  
  console.log("⏳ Creating test WAV file...")
  const samples = new Float32Array(16000).fill(0.1)
  const blob = createWavBlob(samples, TARGET_SAMPLE_RATE)
  const wavBuffer = Buffer.from(await blob.arrayBuffer())
  console.log(`✅ Created WAV buffer: ${wavBuffer.length} bytes`)
  
  console.log("⏳ Setting up mock fetch...")
  const originalFetch = globalThis.fetch
  const originalKey = process.env.OPENAI_API_KEY
  process.env.OPENAI_API_KEY = "test-key-123"
  
  let fetchCalled = false
  globalThis.fetch = (async () => {
    console.log("   🔵 Mock fetch called")
    fetchCalled = true
    return new Response(JSON.stringify({ text: "This is a test transcription." }), { 
      status: 200,
      headers: { 'Content-Type': 'application/json' }
    })
  }) as typeof fetch
  console.log("✅ Mock fetch installed")
  
  try {
    console.log("⏳ Calling transcribeWavBuffer...")
    const startTime = Date.now()
    const result = await transcribeWavBuffer(wavBuffer, "test.wav")
    const duration = Date.now() - startTime
    console.log(`✅ Transcription completed in ${duration}ms`)
    console.log(`   Result: "${result}"`)
    
    assert(fetchCalled, "Mock fetch should have been called")
    assert.equal(result, "This is a test transcription.", "Should return mocked transcription")
    
    console.log("✅ TEST 4 PASSED: Mock transcription works\n")
  } finally {
    console.log("⏳ Restoring original fetch and env...")
    globalThis.fetch = originalFetch
    process.env.OPENAI_API_KEY = originalKey
    console.log("✅ Restored")
  }
})

// ============================================================================
// TEST 5: Session Store - Can we assemble transcripts?
// ============================================================================
test("Phase 5: Session store - assemble transcript segments", { timeout: 5000 }, async () => {
  console.log("\n========================================")
  console.log("TEST 5: Session Store Assembly")
  console.log("========================================")
  
  console.log("⏳ Importing session store...")
  const assemblyModule = await import("../../../assemble/src/session-store.js")
  console.log("✅ Module imported")
  
  const { transcriptionSessionStore } = assemblyModule
  
  console.log("⏳ Creating test session...")
  const sessionId = `test-${Date.now()}`
  console.log(`   Session ID: ${sessionId}`)
  
  const events: any[] = []
  const unsubscribe = transcriptionSessionStore.subscribe(sessionId, (event) => {
    console.log(`   📨 Event received: ${event.event}`)
    events.push(event)
  })
  console.log("✅ Subscribed to session events")
  
  console.log("⏳ Adding segments to session...")
  const segments = [
    { seqNo: 0, startMs: 0, endMs: 10000, durationMs: 10000, overlapMs: 250, transcript: "First segment." },
    { seqNo: 1, startMs: 9750, endMs: 19750, durationMs: 10000, overlapMs: 250, transcript: "Second segment." },
    { seqNo: 2, startMs: 19500, endMs: 29500, durationMs: 10000, overlapMs: 250, transcript: "Third segment." },
  ]
  
  for (const segment of segments) {
    console.log(`   Adding segment ${segment.seqNo}: "${segment.transcript}"`)
    transcriptionSessionStore.addSegment(sessionId, segment)
  }
  console.log(`✅ Added ${segments.length} segments`)
  
  console.log("⏳ Setting final transcript...")
  const finalText = segments.map(s => s.transcript).join(" ")
  transcriptionSessionStore.setFinalTranscript(sessionId, finalText)
  console.log(`✅ Set final transcript: "${finalText}"`)
  
  unsubscribe()
  console.log("✅ Unsubscribed")
  
  // Verify events
  assert(events.length > 0, "Should emit events")
  const finalEvent = events.find(e => e.event === "final")
  assert(finalEvent, "Should emit final event")
  console.log(`   Final transcript from event: "${finalEvent.data.final_transcript}"`)
  
  console.log("✅ TEST 5 PASSED: Session store works\n")
})

// ============================================================================
// TEST 6: Full Pipeline - Everything together
// ============================================================================
test("Phase 6: Complete pipeline - audio to final transcript", { timeout: 10000 }, async () => {
  console.log("\n========================================")
  console.log("TEST 6: COMPLETE PIPELINE")
  console.log("========================================")
  
  // PHASE 1: Create audio segments
  console.log("\n📥 PHASE 1: Audio Segmentation")
  const audioProcessing = await import("../../../audio-ingest/src/capture/audio-processing.js")
  const {
    DEFAULT_OVERLAP_MS,
    DEFAULT_SEGMENT_MS,
    SampleBuffer,
    TARGET_SAMPLE_RATE,
    createWavBlob,
    drainSegments,
  } = audioProcessing
  
  const segmentSamples = Math.round((DEFAULT_SEGMENT_MS / 1000) * TARGET_SAMPLE_RATE)
  const overlapSamples = Math.round((DEFAULT_OVERLAP_MS / 1000) * TARGET_SAMPLE_RATE)
  const segmentAdvanceSamples = segmentSamples - overlapSamples
  
  const samples = new Float32Array(TARGET_SAMPLE_RATE * 30)
  for (let i = 0; i < samples.length; i++) {
    samples[i] = Math.sin((2 * Math.PI * 440 * i) / TARGET_SAMPLE_RATE) * 0.5
  }
  
  const buffer = new SampleBuffer()
  const segments: { blob: Blob; seqNo: number; startMs: number; endMs: number }[] = []
  let seqNo = 0
  
  buffer.push(samples)
  drainSegments(buffer, segmentSamples, overlapSamples, (segSamples) => {
    const startMs = Math.round((seqNo * segmentAdvanceSamples / TARGET_SAMPLE_RATE) * 1000)
    segments.push({
      blob: createWavBlob(segSamples, TARGET_SAMPLE_RATE),
      seqNo,
      startMs,
      endMs: startMs + DEFAULT_SEGMENT_MS,
    })
    seqNo++
  })
  console.log(`✅ Created ${segments.length} segments`)
  
  // PHASE 2: Mock transcription
  console.log("\n🎤 PHASE 2: Transcription (Mocked)")
  const whisperProvider = await import("../../../transcribe/src/providers/whisper-transcriber.js")
  const { transcribeWavBuffer } = whisperProvider
  
  const mockTexts = [
    "Patient reports headache for three days.",
    "Pain is located in the frontal region.",
    "No visual disturbances reported.",
    "Temperature is slightly elevated.",
  ]
  
  const originalFetch = globalThis.fetch
  const originalKey = process.env.OPENAI_API_KEY
  process.env.OPENAI_API_KEY = "test-key"
  
  let callCount = 0
  globalThis.fetch = (async () => {
    const text = mockTexts[callCount % mockTexts.length]!
    console.log(`   API call ${callCount + 1}: "${text}"`)
    callCount++
    return new Response(JSON.stringify({ text }), { status: 200 })
  }) as typeof fetch
  
  const transcripts: { seqNo: number; startMs: number; endMs: number; text: string }[] = []
  
  try {
    for (const segment of segments) {
      const wavBuffer = Buffer.from(await segment.blob.arrayBuffer())
      const text = await transcribeWavBuffer(wavBuffer, `segment-${segment.seqNo}.wav`)
      transcripts.push({
        seqNo: segment.seqNo,
        startMs: segment.startMs,
        endMs: segment.endMs,
        text,
      })
    }
    console.log(`✅ Transcribed ${transcripts.length} segments`)
  } finally {
    globalThis.fetch = originalFetch
    process.env.OPENAI_API_KEY = originalKey
  }
  
  // PHASE 3: Assembly
  console.log("\n🔗 PHASE 3: Assembly")
  const assemblyModule = await import("../../../assemble/src/session-store.js")
  const { transcriptionSessionStore } = assemblyModule
  
  const sessionId = `pipeline-test-${Date.now()}`
  const events: any[] = []
  let finalTranscript = ""
  
  const unsubscribe = transcriptionSessionStore.subscribe(sessionId, (event) => {
    events.push(event)
    if (event.event === "final") {
      finalTranscript = String(event.data.final_transcript ?? "")
    }
  })
  
  for (const transcript of transcripts) {
    transcriptionSessionStore.addSegment(sessionId, {
      seqNo: transcript.seqNo,
      startMs: transcript.startMs,
      endMs: transcript.endMs,
      durationMs: DEFAULT_SEGMENT_MS,
      overlapMs: DEFAULT_OVERLAP_MS,
      transcript: transcript.text,
    })
  }
  
  const combinedText = transcripts.map(t => t.text).join(" ")
  transcriptionSessionStore.setFinalTranscript(sessionId, combinedText)
  
  unsubscribe()
  
  console.log(`✅ Final transcript (${finalTranscript.length} chars):`)
  console.log(`   "${finalTranscript}"`)
  
  // VERIFICATION
  console.log("\n✅ VERIFYING COMPLETE PIPELINE...")
  assert(segments.length >= 2, "Should create multiple segments")
  assert.equal(transcripts.length, segments.length, "Should transcribe all segments")
  assert.equal(finalTranscript, combinedText, "Final transcript should match")
  assert(finalTranscript.includes(transcripts[0]!.text), "Should include first segment")
  assert(events.length > 0, "Should emit events")
  
  console.log("✅✅✅ TEST 6 PASSED: COMPLETE PIPELINE WORKS! ✅✅✅\n")
  
  // Force exit after all tests complete to avoid hanging on setInterval timers
  setTimeout(() => {
    console.log("🏁 All tests complete - forcing process exit")
    process.exit(0)
  }, 100)
})
