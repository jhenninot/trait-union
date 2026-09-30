package fr.traitunion.app;

import android.content.ClipData;
import android.content.Intent;
import android.net.Uri;
import android.os.Bundle;
import android.util.Base64;
import android.speech.RecognizerIntent;
import android.speech.SpeechRecognizer;
import android.speech.tts.TextToSpeech;
import android.webkit.JavascriptInterface;
import android.webkit.WebView;
import androidx.activity.result.ActivityResultLauncher;
import androidx.activity.result.contract.ActivityResultContracts;
import androidx.core.content.FileProvider;
import androidx.core.view.WindowCompat;
import androidx.core.view.WindowInsetsCompat;
import androidx.core.view.WindowInsetsControllerCompat;
import com.getcapacitor.BridgeActivity;
import java.io.ByteArrayOutputStream;
import java.io.File;
import java.io.FileInputStream;
import java.io.FileOutputStream;
import java.io.InputStream;
import java.io.OutputStream;
import java.net.HttpURLConnection;
import java.net.URL;
import java.util.ArrayList;
import java.util.List;
import java.util.Locale;
import org.json.JSONArray;
import org.json.JSONObject;

// L'application web (servie par le serveur de la famille) n'a pas accès aux plugins Capacitor.
// On lui donne la voix d'Android par un petit objet JavaScript, window.TraitUnionVoix :
// lecture à voix haute (TextToSpeech) et reconnaissance vocale (fenêtre « Parlez maintenant »
// d'Android, sans permission micro à demander). Les résultats arrivent dans la page par
// l'événement « tu-voix ». Voir client/src/voix.js.
// Même principe pour les photos, window.TraitUnionPartage : partager une photo de l'appli vers
// une autre application (WhatsApp...), et recevoir celles qu'on partage vers Trait d'union depuis
// la Galerie ou une autre appli (événement « tu-partage »). Voir client/src/partage.js.
// Et window.TraitUnionEcran masque les barres d'Android pour voir une photo en plein écran
// (client/src/pleinEcran.js).
public class MainActivity extends BridgeActivity {

    private TextToSpeech synthese;
    private boolean syntheseOk = false;
    private ActivityResultLauncher<Intent> reconnaissance;
    private static final int MAX_RECUES = 30;
    private final List<JSONObject> recues = new ArrayList<>(); // { nom, type, fichier }

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
        getBridge().getWebView().addJavascriptInterface(new Partage(), "TraitUnionPartage");
        getBridge().getWebView().addJavascriptInterface(new Ecran(), "TraitUnionEcran");
        recevoir(getIntent());
    }

    @Override
    protected void onNewIntent(Intent intent) {
        super.onNewIntent(intent);
        recevoir(intent);
    }

    // Photos partagées vers l'application : copiées tout de suite dans le cache (l'autorisation de
    // lire les fichiers de l'autre appli ne dure pas), puis la page est prévenue.
    private void recevoir(Intent intent) {
        if (intent == null || intent.getType() == null || !intent.getType().startsWith("image/")) return;
        List<Uri> uris = new ArrayList<>();
        if (Intent.ACTION_SEND.equals(intent.getAction())) {
            Uri uri = intent.getParcelableExtra(Intent.EXTRA_STREAM);
            if (uri != null) uris.add(uri);
        } else if (Intent.ACTION_SEND_MULTIPLE.equals(intent.getAction())) {
            ArrayList<Uri> liste = intent.getParcelableArrayListExtra(Intent.EXTRA_STREAM);
            if (liste != null) uris.addAll(liste);
        }
        if (uris.isEmpty()) return;
        setIntent(new Intent(Intent.ACTION_MAIN)); // ne pas recevoir deux fois (rotation, retour)
        new Thread(() -> {
            File dossier = new File(getCacheDir(), "recues");
            dossier.mkdirs();
            List<JSONObject> copiees = new ArrayList<>();
            for (Uri uri : uris.subList(0, Math.min(uris.size(), MAX_RECUES))) {
                try {
                    String type = getContentResolver().getType(uri);
                    if (type == null || !type.startsWith("image/")) type = "image/jpeg";
                    File fichier = File.createTempFile("photo", null, dossier);
                    try (InputStream entree = getContentResolver().openInputStream(uri); OutputStream sortie = new FileOutputStream(fichier)) {
                        copier(entree, sortie);
                    }
                    JSONObject photo = new JSONObject();
                    photo.put("nom", uri.getLastPathSegment() == null ? "photo" : uri.getLastPathSegment());
                    photo.put("type", type);
                    photo.put("fichier", fichier.getAbsolutePath());
                    copiees.add(photo);
                } catch (Exception e) {
                    // Fichier illisible : on passe au suivant
                }
            }
            synchronized (recues) {
                recues.addAll(copiees);
            }
            JSONObject detail = new JSONObject();
            try {
                detail.put("recues", copiees.size());
            } catch (Exception e) {
                return;
            }
            envoyer("tu-partage", detail);
        }).start();
    }

    private static void copier(InputStream entree, OutputStream sortie) throws Exception {
        byte[] tampon = new byte[64 * 1024];
        for (int n; (n = entree.read(tampon)) > 0; ) sortie.write(tampon, 0, n);
    }

    @Override
    public void onDestroy() {
        if (synthese != null) synthese.shutdown();
        super.onDestroy();
    }

    private void envoyer(JSONObject detail) {
        envoyer("tu-voix", detail);
    }

    private void envoyer(String evenement, JSONObject detail) {
        WebView vue = getBridge().getWebView();
        vue.post(() -> vue.evaluateJavascript("window.dispatchEvent(new CustomEvent('" + evenement + "', { detail: " + detail + " }))", null));
    }

    private class Ecran {

        @JavascriptInterface
        public void pleinEcran(boolean actif) {
            runOnUiThread(() -> {
                WindowInsetsControllerCompat barres = WindowCompat.getInsetsController(getWindow(), getWindow().getDecorView());
                if (actif) {
                    barres.setSystemBarsBehavior(WindowInsetsControllerCompat.BEHAVIOR_SHOW_TRANSIENT_BARS_BY_SWIPE);
                    barres.hide(WindowInsetsCompat.Type.systemBars());
                } else {
                    barres.show(WindowInsetsCompat.Type.systemBars());
                }
            });
        }
    }

    private class Partage {

        // Photos reçues d'une autre application, en attente dans le cache
        @JavascriptInterface
        public int nombreRecues() {
            synchronized (recues) {
                return recues.size();
            }
        }

        // Une photo reçue : { nom, type, donnees (base64) }, ou "" si elle n'existe plus
        @JavascriptInterface
        public String photoRecue(int i) {
            try {
                JSONObject photo;
                synchronized (recues) {
                    photo = recues.get(i);
                }
                ByteArrayOutputStream octets = new ByteArrayOutputStream();
                try (InputStream entree = new FileInputStream(photo.getString("fichier"))) {
                    copier(entree, octets);
                }
                JSONObject resultat = new JSONObject();
                resultat.put("nom", photo.getString("nom"));
                resultat.put("type", photo.getString("type"));
                resultat.put("donnees", Base64.encodeToString(octets.toByteArray(), Base64.NO_WRAP));
                return resultat.toString();
            } catch (Exception e) {
                return "";
            }
        }

        @JavascriptInterface
        public void effacerRecues() {
            synchronized (recues) {
                for (JSONObject photo : recues) new File(photo.optString("fichier")).delete();
                recues.clear();
            }
        }

        // Télécharge la photo (lien signé de l'hébergeur) puis ouvre le menu de partage d'Android
        @JavascriptInterface
        public void partager(String adresse, String texte) {
            if (adresse == null || !adresse.startsWith("https://")) return;
            new Thread(() -> {
                try {
                    File dossier = new File(getCacheDir(), "partage");
                    dossier.mkdirs();
                    File[] anciennes = dossier.listFiles();
                    if (anciennes != null) for (File f : anciennes) f.delete();
                    File fichier = new File(dossier, "trait-union-" + System.currentTimeMillis() + ".jpg");
                    HttpURLConnection connexion = (HttpURLConnection) new URL(adresse).openConnection();
                    connexion.setConnectTimeout(15000);
                    connexion.setReadTimeout(30000);
                    try {
                        if (connexion.getResponseCode() != 200) throw new Exception("HTTP " + connexion.getResponseCode());
                        try (InputStream entree = connexion.getInputStream(); OutputStream sortie = new FileOutputStream(fichier)) {
                            copier(entree, sortie);
                        }
                    } finally {
                        connexion.disconnect();
                    }
                    Uri uri = FileProvider.getUriForFile(MainActivity.this, getPackageName() + ".fileprovider", fichier);
                    Intent envoi = new Intent(Intent.ACTION_SEND)
                        .setType("image/jpeg")
                        .putExtra(Intent.EXTRA_STREAM, uri)
                        .addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION);
                    envoi.setClipData(ClipData.newRawUri("", uri));
                    if (texte != null && !texte.isEmpty()) envoi.putExtra(Intent.EXTRA_TEXT, texte);
                    Intent choix = Intent.createChooser(envoi, "Partager la photo");
                    choix.addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION);
                    runOnUiThread(() -> startActivity(choix));
                } catch (Exception e) {
                    JSONObject detail = new JSONObject();
                    try {
                        detail.put("erreur", "partage");
                    } catch (Exception ignoree) {
                        return;
                    }
                    envoyer("tu-partage", detail);
                }
            }).start();
        }
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
