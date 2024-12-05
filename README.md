
# About ResCanvas
## The existing problem
Drawing is an important aspect of art and free expression within a variety of domains. It has been used to express new ideas and works of art. Tools such as MS Paint allow for drawing to be achievable on the computer, with online tools extending that functionality over the cloud, allowing users to share and collaborate on drawings and other digital works of art. For instance, both Google's Drawing and Canva's Draw application allow for users to perform drawings and add text on an online, sharable canvas page between registered users. However, such online platforms store the drawing and user data in a centralized manner, which allows for their data to be easily trackable by their respective companies, and easily sharable to other third parties such as advertisers. Furthermore, the drawings can be censored by both private and public entities, such as governments and tracking agencies. Privacy is important, yet since online collaboration is an essential part of many user's daily workflow, it is necessary to decentralize the data storage aspect of these online applications. The closest working example of this is Reddit's pixel platform, however, user's data is still stored centrally on their servers and the scope is limited to putting one pixel at a time for each user.

## Overview of ResCanvas
Introducing ResCanvas, a breakthrough in web-based drawing platforms that utilizes ResilientDB to ensure that user's drawings are securely stored while allowing for multiple users to collaborate concurrently creating new works of art and free expression without arbitrary limits, tracking, or censorship by anyone. 

ResCanvas is designed to seamlessly integrate drawings with the familiarity of online contribution between users with effective synchronization of each user's canvas drawing page, allowing for error-free consistency even when multiple users are drawing all at the same time.

The key feature of ResCanvas is that all drawings are stored persistently on ResilientDB in a stroke by stroke manner, in which each stroke is individually cached via in-memory data store using Redis serving as the frontend cache to ensure that the end user is able to receive all the strokes from the other users regardless of the response latency of ResilientDB. This ensures that all users will be able to see each other's strokes under a decentralized context.

## Key Features and Use Cases
TODO
## Workflow diagrams
TODO
# Project Setup
TODO: Adopt from command file!


This project was bootstrapped with [Create React App](https://github.com/facebook/create-react-app).

## Available Scripts

In the project directory, you can run:

### `npm start`

Runs the app in the development mode.\
Open [http://localhost:3000](http://localhost:3000) to view it in your browser.

The page will reload when you make changes.\
You may also see any lint errors in the console.

### `npm test`

Launches the test runner in the interactive watch mode.\
See the section about [running tests](https://facebook.github.io/create-react-app/docs/running-tests) for more information.

### `npm run build`

Builds the app for production to the `build` folder.\
It correctly bundles React in production mode and optimizes the build for the best performance.

The build is minified and the filenames include the hashes.\
Your app is ready to be deployed!

See the section about [deployment](https://facebook.github.io/create-react-app/docs/deployment) for more information.

### `npm run eject`

**Note: this is a one-way operation. Once you `eject`, you can't go back!**

If you aren't satisfied with the build tool and configuration choices, you can `eject` at any time. This command will remove the single build dependency from your project.

Instead, it will copy all the configuration files and the transitive dependencies (webpack, Babel, ESLint, etc) right into your project so you have full control over them. All of the commands except `eject` will still work, but they will point to the copied scripts so you can tweak them. At this point you're on your own.

You don't have to ever use `eject`. The curated feature set is suitable for small and middle deployments, and you shouldn't feel obligated to use this feature. However we understand that this tool wouldn't be useful if you couldn't customize it when you are ready for it.

## Learn More

You can learn more in the [Create React App documentation](https://facebook.github.io/create-react-app/docs/getting-started).

To learn React, check out the [React documentation](https://reactjs.org/).

### Code Splitting

This section has moved here: [https://facebook.github.io/create-react-app/docs/code-splitting](https://facebook.github.io/create-react-app/docs/code-splitting)

### Analyzing the Bundle Size

This section has moved here: [https://facebook.github.io/create-react-app/docs/analyzing-the-bundle-size](https://facebook.github.io/create-react-app/docs/analyzing-the-bundle-size)

### Making a Progressive Web App

This section has moved here: [https://facebook.github.io/create-react-app/docs/making-a-progressive-web-app](https://facebook.github.io/create-react-app/docs/making-a-progressive-web-app)

### Advanced Configuration

This section has moved here: [https://facebook.github.io/create-react-app/docs/advanced-configuration](https://facebook.github.io/create-react-app/docs/advanced-configuration)

### Deployment

This section has moved here: [https://facebook.github.io/create-react-app/docs/deployment](https://facebook.github.io/create-react-app/docs/deployment)

### `npm run build` fails to minify

This section has moved here: [https://facebook.github.io/create-react-app/docs/troubleshooting#npm-run-build-fails-to-minify](https://facebook.github.io/create-react-app/docs/troubleshooting#npm-run-build-fails-to-minify)
