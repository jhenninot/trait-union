package fr.traitunion.app;

import android.Manifest;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.content.Context;
import android.content.Intent;
import android.content.pm.PackageManager;
import android.graphics.Bitmap;
import android.graphics.BitmapFactory;
import android.os.Build;
import androidx.core.app.NotificationCompat;
import androidx.core.app.NotificationManagerCompat;
import androidx.core.content.ContextCompat;
import com.google.firebase.messaging.FirebaseMessagingService;
import com.google.firebase.messaging.RemoteMessage;
import java.io.InputStream;
import java.net.HttpURLConnection;
import java.net.URL;
import java.util.Map;

// Alertes envoyées par le serveur de la famille avec Firebase Cloud Messaging
// (server/alertes/envoi.js). Ce sont des messages « data » : c'est ici qu'on construit la
// notification, que l'application soit ouverte ou non. La toucher ouvre la page indiquée
// (MainActivity, EXTRA_URL), sur le serveur où les alertes ont été activées.
public class AlertesService extends FirebaseMessagingService {

    static final String PREFERENCES = "trait_union_alertes";
    static final String ORIGINE = "origine";

    @Override
    public void onNewToken(String jeton) {
        // Rien à faire ici : la page renvoie le jeton au serveur à chaque démarrage
        // (client/src/alertes.js, rafraichirAlertes)
    }

    static void creerCanaux(Context contexte) {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.O) return;
        NotificationManager gestionnaire = contexte.getSystemService(NotificationManager.class);
        NotificationChannel rdv = new NotificationChannel("rendez_vous", "Rappels de rendez-vous", NotificationManager.IMPORTANCE_HIGH);
        rdv.setDescription("Les rendez-vous de l'agenda qui ont une alerte");
        gestionnaire.createNotificationChannel(rdv);
        NotificationChannel photos = new NotificationChannel("photos", "Nouvelles photos", NotificationManager.IMPORTANCE_DEFAULT);
        photos.setDescription("Quand quelqu'un ajoute des photos");
        gestionnaire.createNotificationChannel(photos);
        NotificationChannel messages = new NotificationChannel("messages", "Nouveaux messages", NotificationManager.IMPORTANCE_HIGH);
        messages.setDescription("Les messages reçus dans la messagerie");
        gestionnaire.createNotificationChannel(messages);
        gestionnaire.createNotificationChannel(new NotificationChannel("autres", "Autres alertes", NotificationManager.IMPORTANCE_DEFAULT));
    }

    @Override
    public void onMessageReceived(RemoteMessage message) {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU
            && ContextCompat.checkSelfPermission(this, Manifest.permission.POST_NOTIFICATIONS) != PackageManager.PERMISSION_GRANTED) return;
        Map<String, String> d = message.getData();
        String titre = d.containsKey("titre") ? d.get("titre") : "Trait d'union";
        String corps = d.containsKey("corps") ? d.get("corps") : "";
        String categorie = d.containsKey("categorie") ? d.get("categorie") : "";
        String canal = "rendezVous".equals(categorie) ? "rendez_vous" : "photos".equals(categorie) ? "photos"
            : "messages".equals(categorie) ? "messages" : "autres";
        creerCanaux(this);

        Intent ouvrir = new Intent(this, MainActivity.class).addFlags(Intent.FLAG_ACTIVITY_SINGLE_TOP | Intent.FLAG_ACTIVITY_CLEAR_TOP);
        String origine = getSharedPreferences(PREFERENCES, MODE_PRIVATE).getString(ORIGINE, null);
        String url = d.get("url");
        if (origine != null && url != null && url.startsWith("/")) ouvrir.putExtra(MainActivity.EXTRA_URL, origine + url);
        // Une même étiquette (même rendez-vous, photos du même cercle) remplace l'alerte précédente
        String etiquette = d.containsKey("tag") ? d.get("tag") : String.valueOf(System.currentTimeMillis());
        int id = etiquette.hashCode();
        PendingIntent action = PendingIntent.getActivity(this, id, ouvrir, PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE);

        NotificationCompat.Builder notification = new NotificationCompat.Builder(this, canal)
            .setSmallIcon(R.drawable.ic_alerte)
            .setColor(0xFF2F8F6B)
            .setContentTitle(titre)
            .setContentText(corps)
            .setStyle(new NotificationCompat.BigTextStyle().bigText(corps))
            .setAutoCancel(true)
            .setContentIntent(action)
            .setPriority("rendez_vous".equals(canal) ? NotificationCompat.PRIORITY_HIGH : NotificationCompat.PRIORITY_DEFAULT)
            .setCategory("rendez_vous".equals(canal) ? NotificationCompat.CATEGORY_REMINDER : NotificationCompat.CATEGORY_SOCIAL);

        // Miniature de la photo (lien temporaire de l'hébergeur)
        Bitmap image = telecharger(d.get("image"));
        if (image != null) {
            notification.setLargeIcon(image).setStyle(new NotificationCompat.BigPictureStyle().bigPicture(image).bigLargeIcon((Bitmap) null).setSummaryText(corps));
        }
        try {
            NotificationManagerCompat.from(this).notify(id, notification.build());
        } catch (SecurityException e) {
            // Notifications refusées entre-temps
        }
    }

    private static Bitmap telecharger(String adresse) {
        if (adresse == null || !adresse.startsWith("https://")) return null;
        try {
            HttpURLConnection connexion = (HttpURLConnection) new URL(adresse).openConnection();
            connexion.setConnectTimeout(8000);
            connexion.setReadTimeout(8000);
            try (InputStream entree = connexion.getInputStream()) {
                return BitmapFactory.decodeStream(entree);
            } finally {
                connexion.disconnect();
            }
        } catch (Exception e) {
            return null;
        }
    }
}
