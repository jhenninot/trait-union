package fr.traitunion.app;

import android.content.Intent;
import android.os.Bundle;
import android.speech.RecognizerIntent;
import android.speech.SpeechRecognizer;
import android.speech.tts.TextToSpeech;
import android.webkit.JavascriptInterface;
import android.webkit.WebView;
import androidx.activity.result.ActivityResultLauncher;
import androidx.activity.result.contract.ActivityResultContracts;
import com.getcapacitor.BridgeActivity;
import java.util.ArrayList;
import java.util.Locale;
import org.json.JSONArray;
import org.json.JSONObject;

// L'application web (servie par le serveur de la famille) n'a pas accès aux plugins Capacitor.
// On lui donne la voix d'Android par un petit objet JavaScript, window.TraitUnionVoix :
// lecture à voix haute (TextToSpeech) et reconnaissance vocale (fenêtre « Parlez maintenant »
// d'Android, sans permission micro à demander). Les résultats arrivent dans la page par
// l'événement « tu-voix ». Voir client/src/voix.js.
public class MainActivity extends BridgeActivity {

    private TextToSpeech synthese;
    private boolean syntheseOk = false;
    private ActivityResultLauncher<Intent> reconnaissance;

    @Override
    public void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        synthese = new TextToSpeech(this, (statut) -> {
            if (statut != TextToSpeech.SUCCESS) return;
            int langue = synthese.setLanguage(Locale.FRANCE);
            syntheseOk = langue != TextToSpeech.LANG_MISSING_DATA && langue != TextToSpeech.LANG_NOT_SUPPORTED;
            synthese.setSpeechRate(0.9f);
        });
        reconnaissance = registerForActivityResult(new ActivityResultContracts.StartActivityForResult(), (resultat) -> {
            JSONObject detail = new JSONObject();
            try {
                ArrayList<String> phrases = resultat.getData() == null
                    ? null
                    : resultat.getData().getStringArrayListExtra(RecognizerIntent.EXTRA_RESULTS);
                if (resultat.getResultCode() == RESULT_OK && phrases != null) detail.put("phrases", new JSONArray(phrases));
                else detail.put("erreur", "annule");
            } catch (Exception e) {
                return;
            }
            envoyer(detail);
        });
        getBridge().getWebView().addJavascriptInterface(new Voix(), "TraitUnionVoix");
    }

    @Override
    public void onDestroy() {
        if (synthese != null) synthese.shutdown();
        super.onDestroy();
    }

    private void envoyer(JSONObject detail) {
        WebView vue = getBridge().getWebView();
        vue.post(() -> vue.evaluateJavascript("window.dispatchEvent(new CustomEvent('tu-voix', { detail: " + detail + " }))", null));
    }

    private class Voix {

        @JavascriptInterface
        public boolean lectureDisponible() {
            return syntheseOk;
        }

        @JavascriptInterface
        public void parler(String texte) {
            if (syntheseOk) synthese.speak(texte, TextToSpeech.QUEUE_FLUSH, null, "trait-union");
        }

        @JavascriptInterface
        public void arreter() {
            if (syntheseOk) synthese.stop();
        }

        @JavascriptInterface
        public boolean ecouteDisponible() {
            return SpeechRecognizer.isRecognitionAvailable(MainActivity.this);
        }

        @JavascriptInterface
        public void ecouter() {
            runOnUiThread(() -> {
                if (syntheseOk) synthese.stop();
                Intent intention = new Intent(RecognizerIntent.ACTION_RECOGNIZE_SPEECH)
                    .putExtra(RecognizerIntent.EXTRA_LANGUAGE_MODEL, RecognizerIntent.LANGUAGE_MODEL_FREE_FORM)
                    .putExtra(RecognizerIntent.EXTRA_LANGUAGE, "fr-FR")
                    .putExtra(RecognizerIntent.EXTRA_MAX_RESULTS, 5)
                    .putExtra(RecognizerIntent.EXTRA_PROMPT, "Je vous écoute");
                try {
                    reconnaissance.launch(intention);
                } catch (Exception e) {
                    JSONObject detail = new JSONObject();
                    try {
                        detail.put("erreur", "indisponible");
                    } catch (Exception ignoree) {
                        return;
                    }
                    envoyer(detail);
                }
            });
        }
    }
}
