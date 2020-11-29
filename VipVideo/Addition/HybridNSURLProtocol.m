//
//  HybridNSURLProtocol.m
//  WKWebVIewHybridDemo
//
//  Created by shuoyu liu on 2017/1/16.
//  Copyright © 2017年 shuoyu liu. All rights reserved.
//

#import "HybridNSURLProtocol.h"

static NSString* const KHybridNSURLProtocolHKey = @"KHybridNSURLProtocol";

@interface HybridNSURLProtocol ()<NSURLSessionDelegate>
@property (nonnull,strong) NSURLSessionDataTask *task;

@end


@implementation HybridNSURLProtocol

+ (BOOL)canInitWithRequest:(NSURLRequest *)request
{
    NSString *scheme = [[request URL] scheme];
    if ( ([scheme caseInsensitiveCompare:@"http"]  == NSOrderedSame ||
          [scheme caseInsensitiveCompare:@"https"] == NSOrderedSame ))
    {
        //看看是否已经处理过了，防止无限循环
        if ([NSURLProtocol propertyForKey:KHybridNSURLProtocolHKey inRequest:request]
            ){
            return NO;
        }

        return YES;
    }
    return NO;
}

+ (BOOL)replaceAdHostsWebString:(NSArray *)adhosts response:(NSString **)response{
    BOOL isContain = NO;
    
    for (NSString *adhost in adhosts) {
        isContain = isContain | [[self class]  replaceWebString:adhost response:response];
    }
    return  isContain;
}


+ (BOOL)replaceWebString:(NSString *)adhost response:(NSString **)response{
    BOOL isContain = NO;
    if ([*response containsString:adhost]) {
        *response = [*response stringByReplacingOccurrencesOfString:adhost withString:@""];
        isContain = YES;
    }
    return  isContain;
}


+ (NSURLRequest *)canonicalRequestForRequest:(NSURLRequest *)request
{
    NSMutableURLRequest *mutableReqeust = [request mutableCopy];
    
    //request截取重定向
//    if ([request.URL.absoluteString isEqualToString:sourUrl])
//    {
//        NSURL* url1 = [NSURL URLWithString:localUrl];
//        mutableReqeust = [NSMutableURLRequest requestWithURL:url1];
//    }
    
    NSString *requestUrl = request.URL.absoluteString;
    
    NSLog(@"%@ requestUrl = %@", NSStringFromClass([self class]),requestUrl);

//    // 拦截广告
    if ([requestUrl containsString:@"img.09mk.cn"]
        ||[requestUrl containsString:@"img.xiaohui2.cn"]
        ||[requestUrl containsString:@".xiaohui"]
        ||[requestUrl containsString:@".apple.com"]
        ||[requestUrl containsString:@"img2."]
        ||[requestUrl containsString:@"sysapr.cn"]
        ||[requestUrl containsString:@"ynjczy.net"] ||
        [requestUrl containsString:@"ylbdtg.com"] ||
        [requestUrl containsString:@"662820.com"] ||
        [requestUrl containsString:@"api.vparse.org"] ||
        [requestUrl containsString:@"hyysvip.duapp.com"] ||
        [requestUrl containsString:@"f.qcwzx.net.cn"] ||
        [requestUrl containsString:@"adx.dlads.cn"] ||
        [requestUrl containsString:@"dlads.cn"] ||
        [requestUrl containsString:@"wuo.8h2x.com"] ||
        [requestUrl containsString:@"strip.alicdn.com"]
        ) {
        mutableReqeust = nil;
    }
    
    return mutableReqeust;
}

+ (BOOL)requestIsCacheEquivalent:(NSURLRequest *)a toRequest:(NSURLRequest *)b
{
    return [super requestIsCacheEquivalent:a toRequest:b];
}

- (void)startLoading
{
    NSMutableURLRequest *mutableReqeust = [[self request] mutableCopy];
    //给我们处理过的请求设置一个标识符, 防止无限循环,
    [NSURLProtocol setProperty:@YES forKey:KHybridNSURLProtocolHKey inRequest:mutableReqeust];
    
    NSURLSession *session = [NSURLSession sessionWithConfiguration:[NSURLSessionConfiguration defaultSessionConfiguration] delegate:self delegateQueue:nil];
    self.task = [session dataTaskWithRequest:self.request];
    
    NSLog(@"yyyy request %@", self.request.URL.absoluteString);
    
    [self.task resume];
}
- (void)stopLoading
{
    if (self.task != nil)
    {
        [self.task  cancel];
    }
}


- (void)URLSession:(NSURLSession *)session dataTask:(NSURLSessionDataTask *)dataTask didReceiveResponse:(NSURLResponse *)response completionHandler:(void (^)(NSURLSessionResponseDisposition))completionHandler {
    [[self client] URLProtocol:self didReceiveResponse:response cacheStoragePolicy:NSURLCacheStorageAllowed];
    
    completionHandler(NSURLSessionResponseAllow);
}

- (void)URLSession:(NSURLSession *)session dataTask:(NSURLSessionDataTask *)dataTask didReceiveData:(NSData *)data {
    [[self client] URLProtocol:self didLoadData:data];
}

- (void)URLSession:(NSURLSession *)session task:(NSURLSessionTask *)task didCompleteWithError:(nullable NSError *)error {
    [self.client URLProtocolDidFinishLoading:self];
}

@end
