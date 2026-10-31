import { installDiagnostics, reportDiagnostic } from './diagnostics/index.ts';

// Install before evaluating Pixi, account/storage modules or any screen.
installDiagnostics();
void import('./main.ts').then(({ boot }) => boot()).catch((error) => {
  reportDiagnostic('runtime', 'boot', error);
  const startup = document.getElementById('startup');
  if (!startup) return;
  startup.style.zIndex = '2';
  startup.style.pointerEvents = 'auto';
  startup.replaceChildren();
  const message = document.createElement('p');
  message.textContent = 'Nie udało się uruchomić gry. Sprawdź połączenie i spróbuj ponownie.';
  const retry = document.createElement('button');
  retry.textContent = 'Spróbuj ponownie';
  retry.onclick = () => location.reload();
  startup.append(message, retry);
});
