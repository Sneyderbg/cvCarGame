export function setupOtherControls(onConnect: (url: string) => void) {
  const serverIpInput = document.getElementById("serverIp") as HTMLInputElement;
  const serverConnectBtn = document.getElementById(
    "serverConnect",
  ) as HTMLButtonElement;

  serverConnectBtn.onclick = () => {
    const url = serverIpInput.value;
    if (!url) {
      serverIpInput.placeholder = "type some url idk";
      return;
    }
    const extendedUrl = `ws://${url.replace("http://", "")}`;
    serverIpInput.placeholder = "";
    onConnect(extendedUrl);
  };
}
