//
//  HLVipViewController.m
//  VipVideo
//
//  Created by LHL on 2017/10/20.
//  Copyright © 2017年 SV. All rights reserved.
//

#import "HLVipViewController.h"
#import <WebKit/WebKit.h>
#import "NSView+ZCAddition.h"
#import "VipURLManager.h"

@interface HLVipViewController ()<WKUIDelegate, WKNavigationDelegate>

@property (nonatomic, strong) WKWebView *webView;

@end

@implementation HLVipViewController

- (void)viewDidLoad {
    [super viewDidLoad];
    // Do view setup here.

    self.title = @"vip播放中";
    
    WKWebViewConfiguration *configuration = [[WKWebViewConfiguration alloc] init];
    // 启动驱动，否则flash不可播
    configuration.preferences.plugInsEnabled = YES;
    configuration.preferences.javaEnabled = YES;
    self.webView = [[WKWebView alloc] initWithFrame:self.view.bounds configuration:configuration];
    [self.view addSubview:self.webView];
    
    [[NSNotificationCenter defaultCenter] addObserver:self selector:@selector(vipVideoCurrentApiChange:) name:KHLVipVideoDidChangeCurrentApi object:nil];
}

- (void)viewDidLayout{
    [super viewDidLayout];
    self.webView.frame = self.view.bounds;
    [self.webView reload];
    NSLog(@"HLVipViewController  %@", NSStringFromRect(self.view.frame));

}

- (void)setVideoUrl:(NSString *)videoUrl{
    _videoUrl = videoUrl;
    NSString *finalUrl = [NSString stringWithFormat:@"%@%@", [[VipURLManager sharedInstance] currentVipApi]?:@"",videoUrl?:@""];
    NSURLRequest *request = [NSURLRequest requestWithURL:[NSURL URLWithString:finalUrl]];
    [self.webView loadRequest:request];
}

- (void)back{
    if (self.presentingViewController) {
        [self.presentingViewController dismissViewController:self];
    } else {
        //for the 'show' transition
        [self.view.window close];
    }
}

- (void)vipVideoCurrentApiChange:(NSNotification *)notification{
    NSString *videoUrl = self.videoUrl;
    self.videoUrl = videoUrl;
}

- (void)webView:(WKWebView *)webView decidePolicyForNavigationAction:(WKNavigationAction *)navigationAction decisionHandler:(void (^)(WKNavigationActionPolicy))decisionHandler {
    NSString *requestUrl = navigationAction.request.URL.absoluteString;
    //如果是跳转一个新页面
    if (navigationAction.targetFrame == nil) {
        [webView loadRequest:navigationAction.request];
    }
    if (navigationAction.request.URL.absoluteString.length > 0) {
        
        // 拦截广告
        if ([requestUrl containsString:@"ynjczy.net"] ||
            [requestUrl containsString:@"ylbdtg.com"] ||
            [requestUrl containsString:@"662820.com"] ||
            [requestUrl containsString:@"api.vparse.org"] ||
            [requestUrl containsString:@"hyysvip.duapp.com"]||
            [requestUrl containsString:@"f.qcwzx.net.cn"]
            ) {
            decisionHandler(WKNavigationActionPolicyCancel);
            return;
        }
        NSLog(@"request.URL.absoluteString = %@",requestUrl);
    }
    decisionHandler(WKNavigationActionPolicyAllow);
}

- (void)webView:(WKWebView *)webView didFailProvisionalNavigation:(null_unspecified WKNavigation *)navigation withError:(NSError *)error{
    
}

- (void)webView:(WKWebView *)webView didFailNavigation:(null_unspecified WKNavigation *)navigation withError:(NSError *)error{
    
    
}


@end
