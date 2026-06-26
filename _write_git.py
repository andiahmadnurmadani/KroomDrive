import pathlib

CONTENT = r'''
import React, { useState, useEffect, useCallback } from 'react';
'''.strip()

pathlib.Path(r'D:\shi proj\KroomDrive\components\Files\GitPanel.tsx').write_text(CONTENT, encoding='utf-8')
print('done')
