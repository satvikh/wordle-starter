# Allowed guess list

`allowed_words.txt` contains lower-case, alphabetic English words of lengths 5–8.

It is mechanically filtered from the system's FreeBSD `web2` dictionary. That dictionary's accompanying README states that its 1934 Webster's Second International source copyright has lapsed. The source copy used for this assessment is available at `/usr/share/dict/web2` on the development machine.

The application uses this file only for validating guesses. Answer selection remains the curated non-plural `WORD_BANK` in `backend/main.py`.
