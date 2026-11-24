const hexariHost = "hexari.hirusha.space";
const forgeHost = "forge.hirusha.space";

function currentHostname() {
  return typeof window === "undefined" ? "" : window.location.hostname;
}

export function forgeHref(hostname = currentHostname()) {
  return hostname.toLowerCase() === hexariHost
    ? `https://${forgeHost}/`
    : "/forge";
}

export function hexariHomeHref(hostname = currentHostname()) {
  return hostname.toLowerCase() === forgeHost ? `https://${hexariHost}/` : "/";
}
