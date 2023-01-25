export async function sayHello() {
  const { message } = await import("./message");
  const element = document.getElementById("message");
  if (element) {
    element.innerHTML = message;
    console.log(message);
  }
}

if (import.meta?.hot) {
  import.meta.hot.accept((mod) => {
    mod.sayHello();
  });
}
