import * as Speech from 'expo-speech';

/** Prononce un texte de compréhension orale dans la langue du paquet. */
export function speakAudioText(text: string, language: string) {
  const trimmed = text.trim();
  if (!trimmed) return;
  Speech.stop();
  Speech.speak(trimmed, {
    language: language || 'en-GB',
    rate: 0.92,
  });
}

/** Interrompt toute lecture en cours (changement de carte, sortie de session). */
export function stopSpeaking() {
  Speech.stop();
}
