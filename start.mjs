import { spawnSync } from 'node:child_process';



spawnSync('docker-compose -f docker-compose.yml build', { shell: true, stdio: 'inherit' });
spawnSync('docker-compose -f docker-compose.yml push', { shell: true, stdio: 'inherit' });