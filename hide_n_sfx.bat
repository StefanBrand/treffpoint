cd out
for /d %%i in (*) do (
  attrib /d /s +h %%i/* & attrib -h %%i/TreffPOINT.exe
  "C:\Program Files\7-Zip\7z.exe" d %%i.exe
  "C:\Program Files\7-Zip\7z.exe" a %%i.exe -mmt4 -mx5 -sfx7z.sfx %%i
)
