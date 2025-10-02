import sqlite3

conn = sqlite3.connect('thetamind.db')
cursor = conn.cursor()

cursor.execute("ALTER TABLE users ADD COLUMN coins INTEGER DEFAULT 0")
conn.commit()
conn.close()