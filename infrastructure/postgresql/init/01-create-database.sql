-- Crée la base si elle n’existe pas, en UTF8
CREATE DATABASE cloudity_db
  WITH ENCODING 'UTF8'
  LC_COLLATE='en_US.utf8'
  LC_CTYPE='en_US.utf8'
  TEMPLATE=template0;

-- (À lancer dans le conteneur, inutile si déjà fait par postgres)
\c cloudity_db;
